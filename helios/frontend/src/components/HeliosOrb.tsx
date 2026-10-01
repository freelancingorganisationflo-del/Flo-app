export type OrbState = "idle" | "thinking" | "listening" | "speaking" | "processing";

interface HeliosOrbProps {
  state?: OrbState;
  size?: number;
  className?: string;
  showStatus?: boolean;
}

const STATUS: Record<OrbState, string> = {
  idle: "Online",
  thinking: "Thinking",
  listening: "Listening",
  speaking: "Speaking",
  processing: "Processing",
};

export function HeliosOrb({
  state = "idle",
  size = 180,
  className = "",
  showStatus = false,
}: HeliosOrbProps) {
  const active = state !== "idle";
  const speed =
    state === "thinking" || state === "processing"
      ? "animate-[spin-slow_3.5s_linear_infinite]"
      : "animate-[spin-slow_10s_linear_infinite]";

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`HELIOS core ${state}`}
    >
      <div
        className={`absolute inset-[-22%] rounded-full blur-3xl transition-opacity duration-700 ${
          active ? "opacity-100" : "opacity-70"
        }`}
        style={{
          background:
            "radial-gradient(circle at 38% 32%, rgba(59,130,246,0.45), rgba(99,102,241,0.22) 42%, rgba(139,92,246,0.12) 62%, transparent 74%)",
        }}
      />

      <div className={`absolute inset-0 rounded-full ${speed}`}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, rgba(59,130,246,0.85) 12%, rgba(139,92,246,0.65) 24%, transparent 38%)",
            maskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))",
            WebkitMaskImage:
              "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))",
          }}
        />
      </div>

      <div className="absolute inset-[7%] rounded-full animate-[spin-slower_18s_linear_infinite]">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 180deg, transparent 0%, rgba(139,92,246,0.7) 10%, rgba(59,130,246,0.45) 20%, transparent 32%)",
            maskImage: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1px))",
            WebkitMaskImage:
              "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1px))",
          }}
        />
      </div>

      {(state === "listening" || state === "speaking") && (
        <>
          <span className="absolute inset-0 rounded-full border border-cyan/35 animate-[orb-ring_2.6s_ease-out_infinite]" />
          <span
            className="absolute inset-0 rounded-full border border-violet/25 animate-[orb-ring_2.6s_ease-out_infinite]"
            style={{ animationDelay: "1.2s" }}
          />
        </>
      )}

      <div className="absolute inset-[16%] rounded-full overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 35% 30%, rgba(186,230,253,0.95), rgba(59,130,246,0.85) 32%, rgba(79,70,229,0.9) 62%, rgba(15,23,42,0.95) 100%)",
          boxShadow:
            "inset 0 0 28px rgba(255,255,255,0.35), 0 0 40px rgba(59,130,246,0.45)",
        }}
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.85), transparent 42%)",
          }}
        />
        {state === "thinking" || state === "processing" ? (
          <span className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-white/20 to-transparent animate-scan" />
        ) : null}
      </div>

      {showStatus && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-strong text-[10px] font-semibold tracking-widest uppercase text-cyan">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              state === "thinking" || state === "processing"
                ? "bg-violet shadow-glow-violet animate-blink"
                : state === "listening" || state === "speaking"
                  ? "bg-cyan shadow-glow-cyan animate-blink"
                  : "bg-mint"
            }`}
          />
          {STATUS[state]}
        </span>
      )}
    </div>
  );
}
