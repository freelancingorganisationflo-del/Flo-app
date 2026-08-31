interface AiOrbProps {
  state?: "idle" | "listening" | "thinking";
  size?: number;
  className?: string;
}

export function AiOrb({ state = "idle", size = 180, className = "" }: AiOrbProps) {
  const active = state !== "idle";
  const speed = state === "thinking" ? "animate-[spin-slow_3.5s_linear_infinite]" : "animate-[spin-slow_10s_linear_infinite]";

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`HELIOS core ${state}`}
    >
      {/* ambient halo */}
      <div
        className={`absolute inset-[-18%] rounded-full blur-2xl transition-opacity duration-700 ${
          active ? "opacity-100" : "opacity-60"
        }`}
        style={{
          background:
            "radial-gradient(circle at 35% 35%, rgba(46,230,255,0.35), rgba(61,139,255,0.18) 45%, transparent 70%)",
        }}
      />

      {/* outer rotating conic ring */}
      <div className={`absolute inset-0 rounded-full ${speed}`}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0%, rgba(46,230,255,0.9) 12%, rgba(139,92,246,0.7) 25%, transparent 38%)",
            maskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))",
            WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 3px), black calc(100% - 2px))",
          }}
        />
      </div>

      {/* counter-rotating secondary ring */}
      <div className="absolute inset-[8%] rounded-full animate-[spin-slower_18s_linear_infinite]">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "conic-gradient(from 180deg, transparent 0%, rgba(139,92,246,0.7) 10%, rgba(46,230,255,0.5) 20%, transparent 32%)",
            maskImage: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1px))",
            WebkitMaskImage: "radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 1px))",
          }}
        />
      </div>

      {/* orbiting satellites */}
      <div className="absolute inset-0 animate-[spin-slow_7s_linear_infinite]">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan shadow-glow-cyan" />
      </div>
      <div className="absolute inset-0 animate-[spin-slower_12s_linear_infinite]">
        <span className="absolute bottom-[12%] right-[8%] w-1.5 h-1.5 rounded-full bg-violet shadow-glow-violet" />
      </div>

      {/* listening / thinking pulse rings */}
      {(state === "listening" || state === "thinking") && (
        <span className="absolute inset-0 rounded-full border border-cyan/40 animate-[orb-ring_2.6s_ease-out_infinite]" />
      )}
      {state === "listening" && (
        <span
          className="absolute inset-0 rounded-full border border-cyan/30 animate-[orb-ring_2.6s_ease-out_infinite]"
          style={{ animationDelay: "1.3s" }}
        />
      )}

      {/* glass shell */}
      <div className="absolute inset-[16%] rounded-full glass-strong flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-grid animate-grid-pan opacity-60" />
        {/* scanning beam while thinking */}
        {state === "thinking" && (
          <span className="absolute left-0 right-0 h-1/3 bg-gradient-to-b from-transparent via-cyan/15 to-transparent animate-scan" />
        )}
        <div className="relative flex flex-col items-center justify-center">
          <div
            className={`rounded-full transition-all duration-700 ${
              active ? "animate-pulse-glow" : ""
            }`}
            style={{
              width: size * 0.3,
              height: size * 0.3,
              background:
                "radial-gradient(circle at 35% 35%, #b8f6ff, #2ee6ff 35%, #3d8bff 70%, #8b5cf6)",
              boxShadow:
                "0 0 22px rgba(46,230,255,0.9), 0 0 60px rgba(46,230,255,0.5), inset 0 0 12px rgba(255,255,255,0.6)",
            }}
          />
        </div>
      </div>

      {/* status dot */}
      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-strong text-[10px] font-semibold tracking-widest uppercase text-cyan">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            state === "thinking"
              ? "bg-violet shadow-glow-violet animate-blink"
              : state === "listening"
                ? "bg-cyan shadow-glow-cyan animate-blink"
                : "bg-mint"
          }`}
        />
        {state === "thinking" ? "Thinking" : state === "listening" ? "Listening" : "Online"}
      </span>
    </div>
  );
}
