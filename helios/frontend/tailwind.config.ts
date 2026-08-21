import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#10243E",
        navy2: "#0A1828",
        teal: "#00D9B8",
        teal2: "#00B89C",
        orange: "#FF8C42",
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
