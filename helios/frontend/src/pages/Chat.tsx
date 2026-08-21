import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ChatEvent } from "@/lib/api";
import { Spinner } from "@/components/Spinner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "Remind me tomorrow at 5 PM to call Ravi",
  "What do you remember about me?",
  "Add a task: finish project report by Friday",
  "What's on my plate today?",
];

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(messageText?: string) {
    const text = (messageText ?? input).trim();
    if (!text || streaming) return;
    setError(null);
    setInput("");
    setStreaming(true);

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
          }
        },
        abort.signal
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send();
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-teal flex items-center justify-center text-navy2 font-black text-2xl mb-4">
            H
          </div>
          <h2 className="font-display font-bold text-xl text-flotext mb-2">
            Ask Helios anything
          </h2>
          <p className="text-sm text-grey mb-8 max-w-md">
            I remember facts about you, manage your tasks and reminders, and answer
            your questions. Try one of these:
          </p>
          <div className="flex flex-col gap-2 w-full max-w-md">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={streaming}
                className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-white hover:border-teal hover:shadow-sm transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-teal text-navy2 rounded-br-md"
                    : "bg-white border border-border rounded-bl-md"
                }`}
              >
                {m.tools && m.tools.length > 0 && !m.content && (
                  <div className="flex items-center gap-2 text-grey mb-1">
                    <Spinner className="w-3.5 h-3.5" />
                    <span className="text-xs">Using {m.tools.join(", ")}…</span>
                  </div>
                )}
                {m.content || (streaming && i === messages.length - 1 ? (
                  <span className="text-grey">
                    <Spinner className="w-3.5 h-3.5" />
                  </span>
                ) : null)}
              </div>
            </div>
          ))}
          {error && (
            <div className="flex justify-center">
              <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">
                {error}
              </p>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="shrink-0 px-4 pb-4 pt-2 bg-light border-t border-border"
      >
        <div className="flex items-end gap-2">
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
            placeholder={streaming ? "Helios is typing…" : "Message Helios"}
            className="flex-1 resize-none px-4 py-3 rounded-xl border border-border bg-white focus:border-teal focus:outline-none max-h-32"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-3 rounded-xl bg-orange text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-3 rounded-xl bg-teal text-navy2 text-sm font-semibold hover:bg-teal2 transition-colors disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
