import { useEffect, useRef, useState } from "react";
import { api, effectiveVoice } from "@/lib/api";
import { HeliosOrb } from "@/components/HeliosOrb";
import { Icon } from "@/components/Icon";

interface VoiceLine {
  role: "helios" | "user";
  text: string;
}

type OrbState = "idle" | "listening" | "thinking" | "speaking";

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

const HINT_LABELS: Record<string, string> = {
  idle: "Tap the core to begin",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

export function Voice() {
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ttsVoice, setTtsVoice] = useState<string | undefined>(undefined);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    api
      .getVoiceConfig()
      .then((cfg) => {
        const saved = effectiveVoice(cfg.tts_voice);
        const valid = saved && (cfg.tts_voices ?? []).includes(saved);
        setTtsVoice(valid ? saved : cfg.tts_voice);
      })
      .catch(() => {
        // optional
      });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  useEffect(
    () => () => {
      activeRef.current = false;
      recognitionRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    },
    []
  );

  function addLine(role: "helios" | "user", text: string) {
    setLines((prev) => [...prev, { role, text }]);
  }

  async function speak(text: string): Promise<void> {
    setOrbState("speaking");
    const url = await api.tts(text, ttsVoice);
    await new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      void audio.play();
    });
  }

  function listen(onResult: (transcript: string) => void): void {
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const transcript = e.results[0]?.[0]?.transcript ?? "";
        if (transcript) onResult(transcript);
      };
      rec.onerror = () => setOrbState("idle");
      rec.onend = () => setOrbState("idle");
      recognitionRef.current = rec;
      setOrbState("listening");
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
          if (blob.size === 0) {
            setOrbState("idle");
            return;
          }
          setOrbState("thinking");
          try {
            const text = await api.stt(blob);
            if (text) onResult(text);
            else setOrbState("idle");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Speech-to-text failed.");
            setOrbState("idle");
          }
        };
        mediaRecorderRef.current = mr;
        mediaStreamRef.current = stream;
        setOrbState("listening");
        mr.start();
      })
      .catch(() => {
        setError("Microphone access denied.");
        setOrbState("idle");
      });
  }

  function stopListening() {
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
  }

  async function handleTranscript(transcript: string) {
    if (!activeRef.current) return;
    setError(null);
    addLine("user", transcript);
    setOrbState("thinking");

    let result: { url: string; reply: string };
    try {
      result = await api.talk(transcript, ttsVoice);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Voice reply failed.";
      setError(msg);
      addLine("helios", "I'm having trouble connecting right now.");
      setOrbState("idle");
      return;
    }

    const clean = result.reply.trim();
    if (clean) {
      addLine("helios", clean);
    }
    if (activeRef.current) {
      try {
        await playUrl(result.url);
      } catch {
        // playback failed; conversation can continue silently
      }
    }
    setOrbState("idle");
  }

  function playUrl(url: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onerror = () => {
        audioRef.current = null;
        URL.revokeObjectURL(url);
        resolve();
      };
      void audio.play();
    });
  }

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    activeRef.current = true;
    try {
      const wake = await api.wake();
      addLine("helios", wake.text);
      if (activeRef.current) {
        await speak(wake.text);
      }
      listen((transcript) => void handleTranscript(transcript));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't wake HELIOS.");
      activeRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    activeRef.current = false;
    stopListening();
    audioRef.current?.pause();
    audioRef.current = null;
    setLines([]);
    setError(null);
    setOrbState("idle");
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 pt-5 pb-2">
        <div>
          <h2 className="font-display font-bold text-lg text-ink">Voice Assistant</h2>
          <p className="text-[12px] text-faint mt-0.5">Speak with HELIOS</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            aria-label="Reset conversation"
            title="Reset"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-xs font-semibold text-grey hover:text-cyan hover:border-cyan/40 transition-all"
          >
            <Icon name="refresh" className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-6 py-6 relative">
        {error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 max-w-md w-full px-4">
            <p className="text-sm text-red glass rounded-lg px-4 py-2.5 border-red/30 flex items-center gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0" />
              {error}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void start()}
          disabled={busy || orbState === "listening" || orbState === "speaking"}
          aria-label={HINT_LABELS[orbState]}
          className={`relative rounded-full transition-transform disabled:cursor-default ${
            orbState !== "idle" ? "cursor-default" : "hover:scale-105 active:scale-95"
          }`}
        >
          <div className="relative flex items-center justify-center">
            <HeliosOrb state={orbState === "speaking" ? "thinking" : orbState === "idle" ? "listening" : orbState} size={240} className="animate-float" />
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Icon name="mic" className="w-10 h-10 text-white drop-shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            </span>
          </div>
        </button>

        <div className="mt-8 text-center">
          <p className="font-display font-semibold text-sm tracking-widest uppercase text-cyan text-glow">
            {HINT_LABELS[orbState]}
          </p>
          <div className="mt-4 flex items-end justify-center gap-1 h-8">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="w-1 rounded-full bg-cyan/70"
                style={{
                  height: orbState === "listening" || orbState === "speaking" ? `${8 + ((i * 17) % 22)}px` : "6px",
                  animation: orbState === "listening" || orbState === "speaking" ? `pulse-glow ${0.8 + (i % 5) * 0.12}s ease-in-out infinite` : undefined,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-6 pb-4">
        <div className="max-w-3xl mx-auto">
          {lines.length > 0 ? (
            <div ref={scrollRef} className="glass-strong rounded-2xl p-4 max-h-48 overflow-y-auto scrollbar-slim space-y-2.5">
              {lines.map((l, i) => (
                <div key={i} className={`flex ${l.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3.5 py-2 text-sm leading-relaxed ${
                      l.role === "user"
                        ? "bg-gradient-to-r from-cyan/90 to-blue/90 text-navy font-medium rounded-br-md"
                        : "glass rounded-bl-md border border-line text-ink"
                    }`}
                  >
                    {l.text}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-faint px-3 py-1.5 rounded-full glass">English (US)</span>
              {(orbState === "listening" || orbState === "speaking" || busy) ? (
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-red/15 text-red text-xs font-semibold border border-red/30"
                >
                  <Icon name="stop" className="w-3.5 h-3.5" />
                  Stop
                </button>
              ) : (
                <p className="text-center text-xs text-faint">Spoken conversation will appear here.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
