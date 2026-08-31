import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";

const MODEL_KEY = "helios_model";
const AUTO = "auto";

export function getSelectedModel(): string | null {
  return localStorage.getItem(MODEL_KEY);
}

export function ModelPicker() {
  const [models, setModels] = useState<string[]>([]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [selected, setSelected] = useState<string>(() => getSelectedModel() ?? AUTO);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listModels()
      .then((info) => {
        setModels(info.models);
        setDefaultModel(info.default);
      })
      .catch(() => {
        // models endpoint unavailable; fall back silently
      });
  }, []);

  useEffect(() => {
    localStorage.setItem(MODEL_KEY, selected);
  }, [selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = selected === AUTO ? "Auto" : selected || defaultModel || "Auto";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch AI model"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg glass text-[11px] font-semibold text-grey hover:text-cyan hover:border-cyan/40 transition-all"
      >
        <Icon name="sparkles" className="w-3.5 h-3.5 text-cyan" />
        <span className="max-w-[140px] truncate">{label}</span>
        <Icon name="chevron-down" className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 glass-strong rounded-xl p-1.5 shadow-panel border border-line animate-fade-in z-50">
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
            AI Model
          </p>
          <div className="max-h-72 overflow-y-auto scrollbar-slim">
            <button
              onClick={() => {
                setSelected(AUTO);
                setOpen(false);
              }}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                selected === AUTO
                  ? "text-cyan bg-cyan/[0.08]"
                  : "text-grey hover:text-ink hover:bg-white/[0.05]"
              }`}
            >
              <span className="truncate text-left">
                Auto <span className="text-faint">· HELIOS picks best</span>
              </span>
              {selected === AUTO && <Icon name="check" className="w-4 h-4 shrink-0" />}
            </button>
            {models.map((m) => {
              const active = m === selected;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setSelected(m);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "text-cyan bg-cyan/[0.08]"
                      : "text-grey hover:text-ink hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="truncate text-left">{m}</span>
                  {active && <Icon name="check" className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          <p className="px-3 py-2 border-t border-line mt-1 text-[11px] text-faint">
            Auto picks coding, scripting, reasoning, or writing models per task.
          </p>
        </div>
      )}
    </div>
  );
}
