import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, type ChatEvent } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Markdown } from "@/components/Markdown";
import { Icon } from "@/components/Icon";
import { getSelectedModel, ModelPicker } from "@/components/ModelPicker";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
  model?: string;
}

const SUGGESTIONS = [
  { icon: "clock", text: "Remind me tomorrow at 5 PM to call Ravi" },
  { icon: "brain", text: "What do you remember about me?" },
  { icon: "tasks", text: "Add a task: finish project report by Friday" },
  { icon: "sparkles", text: "What's on my plate today?" },
];

const toolLabels: Record<string, string> = {
  search_documents: "Searching knowledge base",
  create_task: "Creating task",
  save_memory: "Saving memory",
};

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserTextRef = useRef<string>("");
  const autoSentRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stateQuery = (location.state as { query?: string } | null)?.query;

  useEffect(() => {
    if (!stateQuery) return;
    autoSentRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    const id = window.setTimeout(() => {
      if (autoSentRef.current) void send(stateQuery);
    }, 0);
    return () => {
      autoSentRef.current = false;
      window.clearTimeout(id);
    };
  }, []);

  async function send(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");
    setStreaming(true);
    lastUserTextRef.current = text;
    const model = getSelectedModel() ?? "auto";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", tools: [] },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await api.streamChat(
        text,
        (evt: ChatEvent) => {
          if (evt.type === "tool") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  tools: [...(last.tools ?? []), evt.name ?? "tool"],
                };
              }
              return next;
            });
          } else if (evt.type === "delta") {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last.role === "assistant") {
                next[next.length - 1] = { ...last, content: last.content + (evt.text ?? "") };
              }
              return next;
            });
          } else if (evt.type === "done" && evt.model) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last.role === "assistant") {
                next[next.length - 1] = { ...last, model: evt.model };
              }
              return next;
            });
          }
        },
        abort.signal,
        model
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next.pop();
        }
        return next;
      });
      setError(e instanceof Error ? e.message : "Chat failed. Please try again.");
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function regenerate() {
    if (streaming || !lastUserTextRef.current) return;
    setMessages((prev) => {
      if (prev.length >= 2) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    send(lastUserTextRef.current);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 pt-3 pb-1">
        <h2 className="font-display font-bold text-lg text-ink">
          Chat
        </h2>
        <ModelPicker />
      </div>
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan/20 to-violet/20 border border-cyan/30 flex items-center justify-center shadow-glow-cyan animate-pulse-glow">
              <Icon name="sparkles" className="w-8 h-8 text-cyan" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-mint shadow-glow-sm" />
          </div>
          <h2 className="font-display font-bold text-2xl text-ink mb-2 animate-fade-up">
            Ask <span className="gradient-text">HELIOS</span> anything
          </h2>
          <p className="text-sm text-grey mb-8 max-w-md animate-fade-up">
            I remember facts about you, manage your tasks and reminders, and answer
            your questions from your knowledge base.
          </p>
          <div className="grid gap-2 w-full max-w-md animate-fade-up">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.text}
                onClick={() => send(s.text)}
                disabled={streaming}
                className="group text-left text-sm px-4 py-3 rounded-xl glass hover:border-cyan/40 hover:shadow-glow-sm transition-all flex items-center gap-3"
              >
                <Icon name={s.icon} className="w-4 h-4 text-cyan shrink-0" />
                {s.text}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-slim px-4 sm:px-6 py-6 space-y-5">
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-gradient-to-r from-cyan/90 to-blue/90 text-navy font-medium rounded-br-md shadow-glow-sm"
                      : "glass-strong rounded-bl-md border border-line"
                  }`}
                >
                  {m.tools && m.tools.length > 0 && !m.content && (
                    <div className="flex items-center gap-2 text-cyan mb-1">
                      <Spinner className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">
                        {m.tools
                          .map((t) => toolLabels[t] ?? `Using ${t}`)
                          .join(" · ")}
                        …
                      </span>
                    </div>
                  )}
                  {m.content ? (
                    <Markdown text={m.content} />
                  ) : streaming && isLast ? (
                    <div className="flex items-center gap-1 py-1" aria-label="HELIOS is typing">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan animate-blink" />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-cyan animate-blink"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-cyan animate-blink"
                        style={{ animationDelay: "300ms" }}
                      />
                    </div>
                  ) : null}
                  {m.role === "assistant" && m.content && !(streaming && isLast) && (
                    <div className="flex items-center gap-2 mt-2">
                      {m.model && (
                        <span className="flex items-center gap-1 text-[11px] text-faint">
                          <Icon name="sparkles" className="w-3 h-3 text-cyan" />
                          {m.model}
                        </span>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                          } catch {
                            // clipboard unavailable; ignore
                          }
                        }}
                        aria-label="Copy response"
                        title="Copy response"
                        className="flex items-center gap-1 text-[11px] text-faint hover:text-cyan transition-colors"
                      >
                        <Icon name="copy" className="w-3.5 h-3.5" />
                        Copy
                      </button>
                      {isLast && !streaming && (
                        <button
                          onClick={regenerate}
                          aria-label="Regenerate response"
                          title="Regenerate"
                          className="flex items-center gap-1 text-[11px] text-faint hover:text-cyan transition-colors"
                        >
                          <Icon name="refresh" className="w-3.5 h-3.5" />
                          Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
      )}

      <form
        onSubmit={handleSubmit}
        className="shrink-0 px-4 sm:px-6 pb-4 pt-2"
      >
        <div className="max-w-3xl mx-auto">
          <div className="glass-strong rounded-2xl p-1.5 flex items-end gap-2 glow-ring">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={streaming ? "HELIOS is responding…" : "Message HELIOS…"}
              className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none max-h-32 scrollbar-none"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop generating"
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-navy text-sm font-semibold bg-gradient-to-r from-amber to-orange hover:brightness-110 transition-all"
              >
                <Icon name="stop" className="w-4 h-4" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label="Voice input"
                  className="p-2.5 rounded-xl text-grey hover:text-cyan hover:bg-white/[0.06] transition-colors"
                >
                  <Icon name="mic" className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send message"
                  className="p-2.5 rounded-xl bg-gradient-to-r from-cyan to-blue text-navy font-semibold shadow-glow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icon name="send" className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-faint">
            HELIOS can make mistakes. Verify important information.
          </p>
        </div>
      </form>
    </div>
  );
}
