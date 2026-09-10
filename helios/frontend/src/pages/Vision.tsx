import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type VisionConfig } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/Spinner";

const SUGGESTIONS = [
  { icon: "eye", text: "Describe this image in detail" },
  { icon: "document", text: "Read and extract all the text in this image (OCR)" },
  { icon: "info", text: "Is there an error in this screenshot? What does it mean?" },
  { icon: "analytics", text: "Explain what this chart or graph shows" },
  { icon: "code", text: "Analyze this code screenshot" },
];

function previewUrlFor(file: File | null): string {
  if (!file) return "";
  try {
    return URL.createObjectURL(file);
  } catch {
    return "";
  }
}

export function Vision() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<VisionConfig | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [usedModel, setUsedModel] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .getVisionModels()
      .then((c) => {
        setCfg(c);
        setModel(c.default);
      })
      .catch(() => {
        // config is optional; analyze will surface real errors
      });
  }, []);

  useEffect(() => {
    const url = previewUrlFor(file);
    setPreview(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPEG, WebP, GIF or BMP).");
      return;
    }
    setError(null);
    setReply(null);
    setFile(f);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0]);
  }

  async function analyze() {
    if (!file || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setReply(null);
    setUsedModel(null);
    try {
      const res = await api.analyzeImage(file, question || undefined, model || undefined);
      setReply(res.reply);
      setUsedModel(res.model);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  function useSuggestion(text: string) {
    setQuestion(text);
  }

  async function speakReply() {
    if (!reply || speaking) return;
    setSpeaking(true);
    try {
      const url = await api.tts(reply);
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        void audio.play();
      });
    } catch {
      // playback failure is non-fatal
    } finally {
      setSpeaking(false);
    }
  }

  async function copyReply() {
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
    } catch {
      // clipboard may be unavailable; ignore
    }
  }

  function clearAll() {
    setFile(null);
    setReply(null);
    setUsedModel(null);
    setError(null);
    setQuestion("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <div className="relative">
              <Icon name="eye" className="w-6 h-6 text-cyan" />
              <span className="absolute -bottom-0.5 -right-1 w-3 h-3 rounded-full bg-violet/30 border border-violet/40 flex items-center justify-center">
                <Icon name="sparkles" className="w-2 h-2 text-violet" />
              </span>
            </div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Vision</h1>
          </div>
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-xs font-semibold text-grey hover:text-cyan hover:border-cyan/40 transition-all"
          >
            <Icon name="chevron-left" className="w-3.5 h-3.5" />
            Back
          </button>
        </div>
        <p className="text-sm text-grey mb-6 animate-fade-up">
          Upload an image or screenshot — HELIOS reads, explains, and answers questions about what it sees.
        </p>

        {error && (
          <div className="flex items-center justify-between gap-3 text-sm text-red glass border-red/30 rounded-lg px-3 py-2 mb-4 animate-fade-in">
            <span className="flex items-center gap-2">
              <Icon name="info" className="w-4 h-4 shrink-0" />
              {error}
            </span>
            <button onClick={() => setError(null)} aria-label="Dismiss" className="p-1 rounded hover:bg-white/10">
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="glass rounded-2xl p-4 sm:p-5 mb-5 animate-fade-up" style={{ animationDelay: "40ms" }}>
          <div className="flex flex-col sm:flex-row gap-4">
            {/* image upload / preview */}
            <div className="shrink-0 sm:w-56">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
              />
              {preview ? (
                <div className="relative rounded-xl overflow-hidden border border-line group">
                  <img src={preview} alt="Selected" className="w-full sm:w-56 max-h-52 object-cover" />
                  <button
                    onClick={() => {
                      setFile(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    aria-label="Remove image"
                    className="absolute top-2 right-2 p-1.5 rounded-lg glass-strong text-ink hover:text-red transition-colors"
                  >
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="w-full sm:w-56 h-44 rounded-xl border-2 border-dashed border-white/15 text-faint hover:text-cyan hover:border-cyan/50 hover:bg-cyan/[0.04] transition-all flex flex-col items-center justify-center gap-2"
                >
                  <Icon name="upload" className="w-7 h-7" />
                  <span className="text-xs font-semibold">Choose image</span>
                  <span className="text-[10px] px-3 text-center">PNG · JPG · WebP · GIF · BMP</span>
                </button>
              )}
            </div>

            {/* controls */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                placeholder="Ask anything about the image… (leave empty for a full description)"
                className="input-dark resize-none"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-[11px] font-semibold uppercase tracking-widest text-faint">
                  Ask
                </label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => useSuggestion(s.text)}
                      className="chip text-grey border-white/15 hover:text-cyan hover:border-cyan/40 transition-all"
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-auto">
                {cfg && cfg.models.length > 1 && (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="input-dark !w-auto !py-2 text-xs text-grey"
                    aria-label="Vision model"
                  >
                    {cfg.models.map((m) => (
                      <option key={m} value={m} className="bg-navy3">
                        {m}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => void analyze()}
                  disabled={!file || analyzing}
                  className="btn-primary flex items-center gap-2"
                >
                  {analyzing ? <Spinner className="w-4 h-4" /> : <Icon name="eye" className="w-4 h-4" />}
                  {analyzing ? "Looking…" : "Analyze"}
                </button>
                {file && (
                  <button onClick={clearAll} className="btn-ghost text-xs !py-2">
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* result */}
        {(reply || analyzing) && (
          <div ref={resultRef} className="glass-strong rounded-2xl p-5 animate-fade-up">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="sparkles" className="w-4 h-4 text-cyan" />
                <span className="text-xs font-semibold uppercase tracking-widest text-cyan">
                  HELIOS vision
                </span>
              </div>
              {usedModel && !analyzing && (
                <span className="chip text-faint border-white/10">{usedModel}</span>
              )}
            </div>
            {analyzing ? (
              <div className="flex items-center gap-2.5 py-6 text-sm text-grey">
                <Spinner className="w-4 h-4" />
                Analyzing image…
              </div>
            ) : (
              <>
                <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-slim">
                  {reply}
                </div>
                {reply && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-line">
                    <button
                      onClick={() => void copyReply()}
                      className="btn-ghost text-xs !py-2 flex items-center gap-1.5"
                    >
                      <Icon name="copy" className="w-3.5 h-3.5" />
                      Copy
                    </button>
                    <button
                      onClick={() => void speakReply()}
                      disabled={speaking}
                      className="btn-ghost text-xs !py-2 flex items-center gap-1.5"
                    >
                      {speaking ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="volume" className="w-3.5 h-3.5" />}
                      {speaking ? "Speaking…" : "Read aloud"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
