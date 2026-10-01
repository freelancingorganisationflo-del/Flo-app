import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type ChatSource,
  type CodeEvent,
  type CodeFile,
  type CodeSession,
} from "@/lib/api";
import { RichText } from "@/components/rich/RichText";
import { Icon } from "@/components/Icon";
import { getSelectedModel, ModelPicker } from "@/components/ModelPicker";
import { extForLang } from "@/lib/code/highlight";

interface Turn {
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  stage?: string;
  sources?: ChatSource[];
}

type CodeMode = "auto" | "web" | "off";

const SUGGESTIONS = [
  { icon: "file", text: "Write a Python script that renames files in a folder" },
  { icon: "zap", text: "Debug this React error: Cannot read properties of undefined" },
  { icon: "database", text: "SQL query to find the top 5 customers by revenue" },
  { icon: "refresh", text: "Refactor this function to be async and add error handling" },
];

const MODES: { value: CodeMode; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Search only when the question needs live info" },
  { value: "web", label: "Web", title: "Always search the web" },
  { value: "off", label: "Off", title: "Never search the web" },
];

const STAGE_LABELS: Record<string, string> = {
  searching: "Searching the web",
  analyzing: "Reading sources",
  generating: "Writing code",
};

const SESSION_KEY = "helios_code_session";
const MODE_KEY = "helios_code_mode";

function getSavedMode(): CodeMode {
  const value = localStorage.getItem(MODE_KEY);
  return value === "web" || value === "off" ? value : "auto";
}

export function Code() {
  const [sessions, setSessions] = useState<CodeSession[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<CodeMode>(getSavedMode);
  const [sessionMenu, setSessionMenu] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [draft, setDraft] = useState<{ id?: number; name: string; language: string; content: string } | null>(
    null
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setSessionMenu(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const loadSession = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getCodeSession(id);
      setSessionId(id);
      localStorage.setItem(SESSION_KEY, String(id));
      setTurns(
        detail.messages.map((m) => ({
          role: m.role,
          content: m.content,
          model: m.model ?? undefined,
        }))
      );
      setFiles(detail.files);
    } catch (err) {
      setError((err as Error).message);
      setSessionId(null);
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listCodeSessions();
        if (cancelled) return;
        setSessions(list);
        const saved = Number(localStorage.getItem(SESSION_KEY));
        const target = list.find((s) => s.id === saved) ?? list[0];
        if (target) await loadSession(target.id);
        else setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  function updateLast(patch: (turn: Turn) => Turn) {
    setTurns((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.role === "assistant") next[next.length - 1] = patch(last);
      return next;
    });
  }

  async function ensureSession(): Promise<number | null> {
    if (sessionId) return sessionId;
    try {
      const created = await api.createCodeSession();
      setSessions((prev) => [created, ...prev]);
      setSessionId(created.id);
      localStorage.setItem(SESSION_KEY, String(created.id));
      return created.id;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || streaming) return;
    const id = await ensureSession();
    if (!id) return;

    setError(null);
    setInput("");
    setStreaming(true);
    setTurns((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", stage: "generating" },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;
    const model = getSelectedModel() ?? "auto";

    try {
      await api.streamCodeSession(
        id,
        text,
        (evt: CodeEvent) => {
          if (evt.type === "delta") {
            updateLast((turn) => ({
              ...turn,
              content: turn.content + (evt.text ?? ""),
              stage: undefined,
            }));
          } else if (evt.type === "stage") {
            updateLast((turn) => ({ ...turn, stage: evt.stage }));
          } else if (evt.type === "sources") {
            updateLast((turn) => ({ ...turn, sources: evt.sources }));
          } else if (evt.type === "done") {
            updateLast((turn) => ({ ...turn, model: evt.model, stage: undefined }));
            if (evt.title) {
              setSessions((prev) =>
                prev.map((s) => (s.id === id ? { ...s, title: evt.title ?? s.title } : s))
              );
            }
          }
        },
        abort.signal,
        model === "auto" ? undefined : model,
        mode
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  async function newSession() {
    if (streaming) return;
    setError(null);
    try {
      const created = await api.createCodeSession();
      setSessions((prev) => [created, ...prev]);
      setSessionId(created.id);
      localStorage.setItem(SESSION_KEY, String(created.id));
      setTurns([]);
      setFiles([]);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeSession(id: number) {
    if (streaming) return;
    try {
      await api.deleteCodeSession(id);
      const rest = sessions.filter((s) => s.id !== id);
      setSessions(rest);
      if (sessionId === id) {
        setTurns([]);
        setFiles([]);
        if (rest[0]) await loadSession(rest[0].id);
        else {
          setSessionId(null);
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function changeMode(value: CodeMode) {
    setMode(value);
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2000);
  }

  async function saveDraft() {
    if (!draft || !sessionId) return;
    try {
      if (draft.id) {
        const updated = await api.updateCodeFile(sessionId, draft.id, {
          name: draft.name,
          language: draft.language,
          content: draft.content,
        });
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      } else {
        const created = await api.addCodeFile(sessionId, {
          name: draft.name,
          language: draft.language,
          content: draft.content,
        });
        setFiles((prev) => [...prev, created]);
      }
      setDraft(null);
      flash("File saved");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function removeFile(id: number) {
    if (!sessionId) return;
    try {
      await api.deleteCodeFile(sessionId, id);
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (draft?.id === id) setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function saveCodeBlock(lang: string, code: string) {
    if (!sessionId) return;
    const suggested = `snippet.${extForLang(lang)}`;
    const name = window.prompt("Save code block as file:", suggested);
    if (!name?.trim()) return;
    const clean = name.trim();
    try {
      const existing = files.find((f) => f.name === clean);
      if (existing) {
        const updated = await api.updateCodeFile(sessionId, existing.id, {
          content: code,
          language: lang || existing.language,
        });
        setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      } else {
        const created = await api.addCodeFile(sessionId, {
          name: clean,
          language: lang || "text",
          content: code,
        });
        setFiles((prev) => [...prev, created]);
      }
      setShowFiles(true);
      flash(`Saved ${clean}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const currentTitle = sessions.find((s) => s.id === sessionId)?.title ?? "New session";
  const canSend = input.trim().length > 0 && !streaming;
  const empty = turns.length === 0 && !loading;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 px-4 sm:px-6 py-4 border-b border-line">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
            <Icon name="code" className="w-5 h-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display font-bold text-lg text-ink leading-tight">Helios Code</h1>
            <p className="text-[11px] text-faint truncate">Build, debug and create with AI · {currentTitle}</p>
          </div>
          <ModelPicker />
          <button
            onClick={() => setShowFiles((v) => !v)}
            aria-label="Toggle workspace files"
            title="Workspace files"
            className={`relative p-2 rounded-lg glass text-grey hover:text-cyan transition-colors ${
              showFiles ? "text-cyan border-cyan/40" : ""
            }`}
          >
            <Icon name="folder" className="w-4 h-4" />
            {files.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-cyan text-navy text-[10px] font-bold flex items-center justify-center">
                {files.length}
              </span>
            )}
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setSessionMenu((v) => !v)}
              aria-label="Sessions"
              title="Sessions"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg glass text-[11px] font-semibold text-grey hover:text-cyan transition-colors"
            >
              <Icon name="chat" className="w-3.5 h-3.5" />
              Sessions
              <Icon name="chevron-down" className="w-3 h-3" />
            </button>
            {sessionMenu && (
              <div className="absolute right-0 mt-2 w-72 glass-strong rounded-xl p-1.5 shadow-panel border border-line animate-fade-in z-50">
                <button
                  onClick={() => {
                    setSessionMenu(false);
                    void newSession();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-cyan hover:bg-cyan/[0.08] transition-colors"
                >
                  <Icon name="plus" className="w-4 h-4" />
                  New session
                </button>
                <div className="max-h-72 overflow-y-auto scrollbar-slim mt-1 border-t border-line pt-1">
                  {sessions.length === 0 && (
                    <p className="px-3 py-3 text-[12px] text-faint">No sessions yet.</p>
                  )}
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className={`group flex items-center gap-1 rounded-lg ${
                        s.id === sessionId ? "bg-cyan/[0.08]" : "hover:bg-white/[0.05]"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setSessionMenu(false);
                          if (s.id !== sessionId) void loadSession(s.id);
                        }}
                        className={`flex-1 min-w-0 text-left px-3 py-2 text-sm truncate ${
                          s.id === sessionId ? "text-cyan" : "text-grey"
                        }`}
                      >
                        {s.title}
                      </button>
                      <button
                        onClick={() => void removeSession(s.id)}
                        aria-label="Delete session"
                        className="p-1.5 mr-1 rounded-md text-faint opacity-0 group-hover:opacity-100 hover:text-red transition"
                      >
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {showFiles && (
        <section className="shrink-0 px-4 sm:px-6 py-3 border-b border-line bg-white/[0.02]">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-faint flex-1">
                Workspace files
              </p>
              <button
                onClick={() => setDraft({ name: "", language: "text", content: "" })}
                className="flex items-center gap-1 text-[11px] text-grey hover:text-cyan transition-colors"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                New file
              </button>
            </div>
            <p className="text-[11px] text-faint mb-2">
              All files here are shared with the AI as context. Save an answer block with the Save
              button.
            </p>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {files.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-navy2/60 pl-2.5 pr-1 py-1 text-[12px] text-grey"
                  >
                    <button
                      onClick={() => setDraft({ ...f })}
                      className="hover:text-cyan transition-colors"
                    >
                      {f.name}
                    </button>
                    <button
                      onClick={() => void removeFile(f.id)}
                      aria-label={`Delete ${f.name}`}
                      className="p-0.5 rounded text-faint hover:text-red transition-colors"
                    >
                      <Icon name="x" className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {draft && (
              <div className="rounded-xl border border-line bg-navy2/60 p-2.5 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    placeholder="file name (e.g. app.py)"
                    className="flex-1 bg-transparent border border-line rounded-lg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-cyan/50"
                  />
                  <input
                    value={draft.language}
                    onChange={(e) => setDraft({ ...draft, language: e.target.value })}
                    placeholder="language"
                    className="w-28 bg-transparent border border-line rounded-lg px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus:outline-none focus:border-cyan/50"
                  />
                </div>
                <textarea
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  rows={6}
                  placeholder="file contents…"
                  className="w-full resize-y bg-transparent border border-line rounded-lg px-2.5 py-2 text-[13px] font-code text-ink placeholder:text-faint focus:outline-none focus:border-cyan/50"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setDraft(null)}
                    className="px-3 py-1.5 rounded-lg text-[12px] text-grey hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void saveDraft()}
                    disabled={!draft.name.trim()}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors disabled:opacity-40"
                  >
                    Save file
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim px-4 sm:px-6 py-5">
        <div className="max-w-4xl mx-auto space-y-4">
          {loading && (
            <p className="text-center text-sm text-faint pt-10">Loading session…</p>
          )}

          {empty && !loading && (
            <div className="pt-6">
              <div className="text-center mb-6">
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan/20 to-violet/20 text-cyan mb-3">
                  <Icon name="tools" className="w-7 h-7" />
                </span>
                <h2 className="font-display font-bold text-xl text-ink">What are we building?</h2>
                <p className="text-sm text-grey mt-1">
                  Describe a task, paste an error, or ask how something works.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    className="flex items-start gap-3 text-left glass rounded-xl px-4 py-3 hover:border-cyan/40 transition-all"
                  >
                    <Icon name={s.icon} className="w-4 h-4 text-cyan mt-0.5 shrink-0" />
                    <span className="text-[13px] text-grey">{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-cyan/15 border border-cyan/25 px-4 py-2.5 text-sm text-ink whitespace-pre-wrap break-words">
                  {turn.content}
                </div>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <div className="w-full glass rounded-2xl rounded-bl-md border border-line px-4 py-3">
                  {turn.stage && !turn.content && (
                    <p className="flex items-center gap-2 text-[12px] text-faint">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan animate-blink" />
                      {STAGE_LABELS[turn.stage] ?? "Working"}…
                    </p>
                  )}
                  {turn.content && (
                    <>
                      <RichText
                        text={turn.content}
                        showSources={false}
                        previewCode
                        onSaveCode={saveCodeBlock}
                      />
                      {turn.sources && turn.sources.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {turn.sources.map((src, index) => (
                            <a
                              key={`${src.url}-${index}`}
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.02] px-2.5 py-1 text-[11px] text-grey hover:text-cyan hover:border-cyan/40 transition-colors max-w-[16rem]"
                            >
                              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cyan/15 text-cyan text-[10px] font-semibold">
                                {index + 1}
                              </span>
                              <span className="truncate">{src.title || src.domain}</span>
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="mt-2.5 pt-2 border-t border-line/60 flex items-center gap-3">
                        {turn.model && (
                          <span className="text-[10px] text-faint truncate max-w-[16rem]">
                            {turn.model}
                          </span>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(turn.content);
                            } catch {
                              // clipboard unavailable; ignore
                            }
                          }}
                          aria-label="Copy response"
                          className="ml-auto flex items-center gap-1 text-[11px] text-faint hover:text-cyan transition-colors"
                        >
                          <Icon name="copy" className="w-3.5 h-3.5" />
                          Copy
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          )}

          {notice && (
            <div className="flex justify-center">
              <p className="text-[12px] text-mint glass rounded-lg px-3 py-1.5 border-mint/30">
                {notice}
              </p>
            </div>
          )}
          {error && (
            <div className="flex justify-center">
              <p className="text-sm text-red glass rounded-lg px-4 py-2.5 border-red/30 flex items-center gap-2">
                <Icon name="info" className="w-4 h-4" />
                {error}
              </p>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="shrink-0 px-4 sm:px-6 pb-4 pt-2"
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center rounded-xl glass p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => changeMode(m.value)}
                  title={m.title}
                  aria-pressed={mode === m.value}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
                    mode === m.value
                      ? "bg-cyan/20 text-cyan font-medium"
                      : "text-faint hover:text-grey"
                  }`}
                >
                  {m.value === "auto" && <Icon name="globe" className="w-3.5 h-3.5" />}
                  {m.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-faint">
              {mode === "auto"
                ? "Web search: only when needed"
                : mode === "web"
                  ? "Web search: always on"
                  : "Web search: off"}
            </span>
          </div>
          <div className="glass-strong rounded-2xl p-1.5 flex items-end gap-2 glow-ring">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={streaming ? "HELIOS is writing code…" : "Describe the code you need…"}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none max-h-32 scrollbar-none"
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setStreaming(false);
                }}
                aria-label="Stop generating"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-navy text-sm font-semibold bg-gradient-to-r from-amber to-orange hover:brightness-110 transition-all"
              >
                <Icon name="stop" className="w-4 h-4" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                className="p-2.5 rounded-xl bg-gradient-to-r from-cyan to-blue text-navy font-semibold shadow-glow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
              >
                <Icon name="send" className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            HELIOS Code cannot run code on the server. HTML/CSS/JS previews run sandboxed in your
            browser.
          </p>
        </div>
      </form>
    </div>
  );
}
