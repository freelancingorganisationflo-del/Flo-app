import { useParams } from "react-router-dom";
import { Icon } from "@/components/Icon";

const meta: Record<string, { icon: string; blurb: string }> = {
  tools: { icon: "tools", blurb: "Connect and configure skills that extend HELIOS." },
  automation: { icon: "zap", blurb: "Design triggers and workflows that run automatically." },
  calendar: { icon: "calendar", blurb: "Your schedule, events, and reminders in one timeline." },
  files: { icon: "folder", blurb: "Every document and upload, indexed and searchable." },
  analytics: { icon: "analytics", blurb: "Usage, tokens, and intelligence metrics." },
};

export function Placeholder() {
  const { module } = useParams<{ module: string }>();
  const m = meta[module ?? ""] ?? { icon: "sparkles", blurb: "Module under calibration." };
  const title = (module ?? "module")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
        <div className="glass rounded-2xl p-8 sm:p-12 flex flex-col items-center text-center animate-fade-up">
          <div className="relative mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan/20 to-violet/20 border border-cyan/30 flex items-center justify-center text-cyan shadow-glow-cyan">
              <Icon name={m.icon} className="w-8 h-8" />
            </div>
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-violet shadow-glow-violet animate-blink" />
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">{title}</h1>
          <p className="mt-2 text-grey max-w-md leading-relaxed">{m.blurb}</p>
          <span className="mt-5 chip border-amber/30 text-amber bg-amber/10">Coming online</span>
          <p className="mt-6 text-xs text-faint">
            This module is part of the HELIOS roadmap and is being calibrated.
          </p>
        </div>
      </div>
    </div>
  );
}
