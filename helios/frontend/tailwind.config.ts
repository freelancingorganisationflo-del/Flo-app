import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: "var(--bg)",
        navy2: "var(--bg-2)",
        navy3: "var(--surface)",
        surface: "var(--surface)",
        line: "var(--border)",
        cyan: "var(--primary)",
        blue: "var(--primary)",
        violet: "var(--accent)",
        mint: "var(--mint)",
        orange: "var(--amber)",
        amber: "var(--amber)",
        red: "var(--red)",
        grey: "var(--muted)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        light: "var(--bg)",
        ink: "var(--text)",
        border: "var(--border)",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        code: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        "glow-cyan": "0 0 28px rgba(46, 230, 255, 0.35)",
        "glow-violet": "0 0 28px rgba(139, 92, 246, 0.35)",
        "glow-red": "0 0 20px rgba(248, 113, 113, 0.45)",
        "glow-sm": "0 0 14px rgba(46, 230, 255, 0.22)",
        "panel": "0 8px 32px rgba(0, 0, 0, 0.45)",
      },
      backgroundImage: {
        "aurora": "radial-gradient(60% 60% at 20% 10%, rgba(46,230,255,0.10) 0%, transparent 60%), radial-gradient(50% 50% at 80% 20%, rgba(139,92,246,0.12) 0%, transparent 60%), radial-gradient(60% 60% at 50% 100%, rgba(61,139,255,0.08) 0%, transparent 60%)",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        "spin-slow": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "spin-slower": {
          "0%": { transform: "rotate(360deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "orb-ring": {
          "0%": { transform: "scale(0.6)", opacity: "0.8" },
          "100%": { transform: "scale(1.9)", opacity: "0" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scan: {
          "0%": { top: "0%" },
          "100%": { top: "100%" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        "spin-slow": "spin-slow 10s linear infinite",
        "spin-slower": "spin-slower 18s linear infinite",
        float: "float 6s ease-in-out infinite",
        "orb-ring": "orb-ring 2.6s ease-out infinite",
        "fade-up": "fade-up 0.5s ease-out both",
        "fade-in": "fade-in 0.4s ease-out both",
        scan: "scan 4s ease-in-out infinite alternate",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
