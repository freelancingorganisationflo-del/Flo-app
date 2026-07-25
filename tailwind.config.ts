import type { Config } from "tailwindcss";

// FLO brand tokens — carried over from the existing prototype so the visual
// language stays identical while the app is rebuilt underneath it.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: "#10243E",
        navy2: "#0A1828",
        teal: "#00D9B8",
        teal2: "#00B89C",
        tealDim: "rgba(0,217,184,0.12)",
        tealBorder: "rgba(0,217,184,0.25)",
        orange: "#FF8C42",
        orangeDim: "rgba(255,140,66,0.12)",
        red: "#FF4B4B",
        redDim: "rgba(255,75,75,0.1)",
        green: "#00C896",
        greenDim: "rgba(0,200,150,0.1)",
        grey: "#6B7A90",
        light: "#F5F7FA",
        border: "#E8ECF2",
        flotext: "#1A2535",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "14px",
      },
    },
  },
  plugins: [],
} satisfies Config;
