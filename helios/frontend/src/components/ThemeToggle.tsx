import { Icon } from "@/components/Icon";
import { useTheme } from "@/contexts/ThemeContext";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Light mode" : "Dark mode"}
        className="p-2 rounded-xl text-grey hover:text-ink hover:bg-white/5 transition-colors"
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center rounded-xl glass p-0.5">
      <button
        type="button"
        onClick={() => setTheme("light")}
        aria-pressed={theme === "light"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
          theme === "light" ? "bg-blue/20 text-blue" : "text-faint hover:text-ink"
        }`}
      >
        <Icon name="sun" className="w-3.5 h-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setTheme("dark")}
        aria-pressed={theme === "dark"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
          theme === "dark" ? "bg-blue/20 text-blue" : "text-faint hover:text-ink"
        }`}
      >
        <Icon name="moon" className="w-3.5 h-3.5" />
        Dark
      </button>
    </div>
  );
}
