import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, effectiveVoice, type ChatEvent, type ChatSource } from "@/lib/api";
import { Spinner } from "@/components/Spinner";
import { Markdown } from "@/components/Markdown";
import { Icon } from "@/components/Icon";
import { getSelectedModel, ModelPicker } from "@/components/ModelPicker";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: string;
  tools?: string[];
  model?: string;
  stage?: string;
  sources?: ChatSource[];
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEventLike {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const SUGGESTIONS = [
  { icon: "clock", text: "Remind me tomorrow at 5 PM to call Ravi" },
  { icon: "brain", text: "What do you remember about me?" },
  { icon: "tasks", text: "Add a task: finish project report by Friday" },
  { icon: "globe", text: "Search the web for today's AI news" },
];

const toolLabels: Record<string, string> = {
  search_documents: "Searching knowledge base",
  web_search: "Searching the web",
  fetch_url: "Reading web page",
  current_datetime: "Checking the time",
  create_task: "Creating task",
  save_memory: "Saving memory",
};

const stageLabels: Record<string, string> = {
  searching: "Searching the web",
  reading: "Reading sources",
  analyzing: "Analyzing information",
  generating: "Generating answer",
};

type SearchMode = "auto" | "web" | "off";

const SEARCH_MODE_KEY = "helios_search_mode";

const SEARCH_MODES: { value: SearchMode; label: string; title: string }[] = [
  { value: "auto", label: "Auto", title: "Let HELIOS decide when to search" },
  { value: "web", label: "Web", title: "Always search the web" },
  { value: "off", label: "Off", title: "Never search the web" },
];

function getSavedMode(): SearchMode {
  const value = localStorage.getItem(SEARCH_MODE_KEY);
  return value === "web" || value === "off" ? value : "auto";
}

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef("");
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>(getSavedMode);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserTextRef = useRef<string>("");
  const lastUserImageRef = useRef<{ file: File; preview: string } | null>(null);
  const autoSentRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<{ tts_voice: string; tts_voices?: string[] } | null>(null);
  const ttsVoice = effectiveVoice(voiceConfig?.tts_voice);
  const location = useLocation();
  const navigate = useNavigate();

  function changeMode(mode: SearchMode) {
    setSearchMode(mode);
    localStorage.setItem(SEARCH_MODE_KEY, mode);
  }

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

  async function send(
    messageText?: string,
    image?: { file: File; preview: string } | null
  ) {
    const text = (messageText ?? input).trim();
    const attachment =
      image === undefined
        ? imageFile && imagePreview
          ? { file: imageFile, preview: imagePreview }
          : null
        : image;
    if ((!text && !attachment) || streaming) return;
    setError(null);
    setInput("");
    setImageFile(null);
    setImagePreview(null);
    setStreaming(true);
    lastUserTextRef.current = text;
    lastUserImageRef.current = attachment;
    const model = getSelectedModel() ?? "auto";

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, image: attachment?.preview },
      { role: "assistant", content: "", tools: [] },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      if (attachment) {
        const res = await api.analyzeImage(attachment.file, text || undefined);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last.role === "assistant") {
            next[next.length - 1] = { ...last, content: res.reply, model: res.model };
          }
          return next;
        });
      } else {
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
            } else if (evt.type === "stage") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.role === "assistant") {
                  next[next.length - 1] = { ...last, stage: evt.stage };
                }
                return next;
              });
            } else if (evt.type === "sources") {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last.role === "assistant") {
                  next[next.length - 1] = { ...last, sources: evt.sources ?? [] };
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
          model,
          searchMode
        );
      }
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
    if (streaming) return;
    const img = lastUserImageRef.current;
    if (!lastUserTextRef.current && !img) return;
    setMessages((prev) => {
      if (prev.length >= 2) {
        return prev.slice(0, -1);
      }
      return prev;
    });
    void send(lastUserTextRef.current, img);
  }

  function pickImage(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPEG, WebP, GIF or BMP).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageFile(f);
      setImagePreview(typeof reader.result === "string" ? reader.result : "");
      setError(null);
    };
    reader.onerror = () => setError("Could not read that image. Try another file.");
    reader.readAsDataURL(f);
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSend = Boolean(input.trim() || imageFile);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  useEffect(() => {
    api
      .getVoiceConfig()
      .then((cfg) => {
        const saved = effectiveVoice(cfg.tts_voice);
        const valid = saved && (cfg.tts_voices ?? []).includes(saved);
        setVoiceConfig({
          tts_voice: valid ? saved : cfg.tts_voice,
          tts_voices: cfg.tts_voices,
        });
      })
      .catch(() => {
        // voice config optional; hide nothing
      });
  }, []);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    []
  );

  function startRecording() {
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript ?? "";
        if (transcript) {
          const combined = inputRef.current.trim()
            ? `${inputRef.current.trim()} ${transcript}`
            : transcript;
          setInput(combined);
          send(combined);
        }
      };
      rec.onerror = () => setRecording(false);
      rec.onend = () => setRecording(false);
      recognitionRef.current = rec;
      setRecording(true);
      rec.start();
      return;
    }

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const mr = new MediaRecorder(stream);
        recordingChunksRef.current = [];
        mr.ondataavailable = (e) => {
          if (e.data.size > 0) recordingChunksRef.current.push(e.data);
        };
        mr.onstop = async () => {
          mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
          const blob = new Blob(recordingChunksRef.current, { type: "audio/webm" });
          if (blob.size === 0) return;
          setRecording(false);
          try {
            const text = await api.stt(blob);
            if (text) {
              setInput((prev) => (prev ? `${prev} ${text}` : text));
            } else {
              setError("No speech detected. Try again.");
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Speech-to-text failed.");
          }
        };
        mediaRecorderRef.current = mr;
        mediaStreamRef.current = stream;
        setRecording(true);
        mr.start();
      })
      .catch(() => {
        setError("Microphone access denied.");
      });
  }

  function stopRecording() {
    const rec = recognitionRef.current;
    if (rec) {
      rec.stop();
      recognitionRef.current = null;
    }
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stop();
      mediaRecorderRef.current = null;
    }
    setRecording(false);
  }

  function toggleVoice() {
    if (recording) stopRecording();
    else startRecording();
  }

  async function speak(index: number, text: string) {
    if (speakingId === index) {
      audioRef.current?.pause();
      audioRef.current = null;
      setSpeakingId(null);
      return;
    }
    audioRef.current?.pause();
    try {
      const url = await api.tts(text, ttsVoice);
      const audio = new Audio(url);
      audio.onended = () => {
        audioRef.current = null;
        setSpeakingId(null);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        audioRef.current = null;
        setSpeakingId(null);
        URL.revokeObjectURL(url);
        setError("TTS playback failed.");
      };
      audioRef.current = audio;
      setSpeakingId(index);
      await audio.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : "TTS failed.");
    }
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
                  {m.image && (
                    <img
                      src={m.image}
                      alt="Attached"
                      className="mb-2 rounded-lg max-h-60 w-auto border border-line/40"
                    />
                  )}
                  {!m.content && (m.stage || (m.tools && m.tools.length > 0)) && (
                    <div className="flex items-center gap-2 text-cyan mb-1">
                      <Spinner className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">
                        {m.stage
                          ? stageLabels[m.stage] ?? m.stage
                          : (m.tools ?? [])
                              .map((t) => toolLabels[t] ?? `Using ${t}`)
                              .join(" · ")}
                        …
                      </span>
                    </div>
                  )}
                  {m.content ? (
                    <Markdown
                      text={m.content}
                      showSources={!(m.sources && m.sources.length > 0)}
                    />
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
                  {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-line/40">
                      <p className="text-[11px] font-semibold text-grey mb-1.5 flex items-center gap-1.5">
                        <Icon name="globe" className="w-3 h-3 text-cyan" />
                        Sources
                      </p>
                      <ul className="space-y-1">
                        {m.sources.map((s, si) => (
                          <li key={`${s.url}-${si}`}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group flex items-start gap-2 text-[12px] text-grey hover:text-cyan transition-colors"
                            >
                              <span className="text-faint shrink-0">{si + 1}.</span>
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{s.title}</span>
                                <span className="block truncate text-[11px] text-faint">
                                  {s.domain}
                                </span>
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {m.role === "assistant" && m.content && !(streaming && isLast) && (
                    <div className="flex items-center gap-2 mt-2">
                      {m.model && (
                        <span className="flex items-center gap-1 text-[11px] text-faint">
                          <Icon name="sparkles" className="w-3 h-3 text-cyan" />
                          {m.model}
                        </span>
                      )}
                      <button
                        onClick={() => void speak(i, m.content)}
                        aria-label={speakingId === i ? "Stop speaking" : "Speak response"}
                        title={speakingId === i ? "Stop speaking" : "Speak response"}
                        className="flex items-center gap-1 text-[11px] text-faint hover:text-cyan transition-colors"
                      >
                        <Icon
                          name={speakingId === i ? "stopVoice" : "volume"}
                          className="w-3.5 h-3.5"
                        />
                        {speakingId === i ? "Stop" : "Speak"}
                      </button>
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
          {imagePreview && (
            <div className="mb-2 flex items-center gap-3 glass rounded-xl p-2 pr-3 w-fit">
              <img
                src={imagePreview}
                alt="Attachment preview"
                className="h-14 w-14 rounded-lg object-cover border border-line/40"
              />
              <span className="text-xs text-grey max-w-[10rem] truncate">
                {imageFile?.name ?? "Image"}
              </span>
              <button
                type="button"
                onClick={clearImage}
                aria-label="Remove image"
                title="Remove image"
                className="p-1 rounded-lg text-grey hover:text-red hover:bg-white/[0.06] transition-colors"
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center rounded-xl glass p-0.5">
              {SEARCH_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => changeMode(m.value)}
                  title={m.title}
                  aria-pressed={searchMode === m.value}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-lg transition-colors ${
                    searchMode === m.value
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
              {searchMode === "auto"
                ? "Web search: auto"
                : searchMode === "web"
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
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach image"
                  title="Attach image"
                  className="p-2.5 rounded-xl text-grey hover:text-cyan hover:bg-white/[0.06] transition-colors"
                >
                  <Icon name="paperclip" className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={toggleVoice}
                  aria-label={recording ? "Stop recording" : "Voice input"}
                  title={recording ? "Stop recording" : "Voice input"}
                  className={`p-2.5 rounded-xl transition-colors ${
                    recording
                      ? "bg-red/20 text-red animate-pulse shadow-glow-red"
                      : "text-grey hover:text-cyan hover:bg-white/[0.06]"
                  }`}
                >
                  <Icon name="mic" className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={!canSend}
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
