import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Automation, type Document, type Task } from "@/lib/api";
import { HeliosOrb } from "@/components/HeliosOrb";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatClock(d: Date): { date: string; time: string } {
  return {
    date: d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const chips = [
  { label: "Research", to: "/search" },
  { label: "Code", to: "/code" },
  { label: "Create", to: "/chat" },
  { label: "Analyze", to: "/vision" },
  { label: "Automate", to: "/automation" },
];

const heroActions = [
  { label: "Chat", hint: "Have a conversation", to: "/chat", icon: "chat" },
  { label: "Search", hint: "Find information", to: "/search", icon: "search" },
  { label: "Code", hint: "Build & debug", to: "/code", icon: "code" },
  { label: "Automate", hint: "Let HELIOS work for you", to: "/automation", icon: "zap" },
];

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);

  const load = useCallback(async () => {
    const [taskRes, docRes, autoRes] = await Promise.allSettled([
      api.listTasks(),
      api.listDocuments(),
      api.listAutomations(),
    ]);
    if (taskRes.status === "fulfilled") setTasks(taskRes.value);
    if (docRes.status === "fulfilled") setDocs(docRes.value);
    if (autoRes.status === "fulfilled") setAutomations(autoRes.value);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const name = (user?.email?.split("@")[0] ?? "Operator").replace(/[._-]/g, " ");
  const clock = formatClock(now);
  const pending = tasks.filter((t) => t.status === "pending");
  const reminders = tasks.filter((t) => t.reminder_at && t.status === "pending");
  const dueToday = pending.filter((t) => {
    if (!t.due_at) return false;
    const d = new Date(t.due_at);
    return d.toDateString() === now.toDateString();
  });

  const activity = useMemo(() => {
    const items: { title: string; when: string }[] = [];
    [...docs]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 2)
      .forEach((d) => items.push({ title: d.title, when: relativeTime(d.created_at) }));
    [...automations]
      .filter((a) => a.last_run_at)
      .sort((a, b) => +new Date(b.last_run_at!) - +new Date(a.last_run_at!))
      .slice(0, 2)
      .forEach((a) => items.push({ title: `${a.name} ran`, when: relativeTime(a.last_run_at!) }));
    [...tasks]
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .slice(0, 2)
      .forEach((t) => items.push({ title: t.title, when: relativeTime(t.updated_at) }));
    return items.slice(0, 5);
  }, [docs, automations, tasks]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    navigate("/chat", { state: { query: text } });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
        <div className="hidden lg:flex items-center justify-end gap-3 mb-2 text-[12px] text-grey">
          <span className="flex items-center gap-1.5">
            <Icon name="calendar" className="w-3.5 h-3.5" />
            {clock.date}
          </span>
          <span className="text-faint">·</span>
          <span className="flex items-center gap-1.5">
            <Icon name="clock" className="w-3.5 h-3.5" />
            {clock.time}
          </span>
          <ThemeToggle compact />
          <button
            onClick={() => navigate("/settings")}
            className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan to-violet text-navy text-xs font-bold"
            aria-label="Open settings"
          >
            {name.slice(0, 1).toUpperCase()}
          </button>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <section className="relative min-h-[520px] glass rounded-[20px] px-5 sm:px-8 py-8 overflow-hidden">
            <div
              className="absolute inset-0 pointer-events-none opacity-80"
              style={{
                background:
                  "radial-gradient(50% 55% at 42% 42%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 70%)",
              }}
            />
            <div className="relative text-center">
              <h1 className="font-display font-bold text-3xl sm:text-4xl text-ink capitalize">
                {greeting()}, {name}
              </h1>
              <p className="mt-2 text-sm text-grey">Your AI assistant, always ready to help.</p>
            </div>

            <div className="relative flex flex-col items-center mt-8 mb-6">
              <button
                type="button"
                onClick={() => navigate("/voice")}
                aria-label="Open voice assistant"
                className="rounded-full transition-transform hover:scale-[1.03] active:scale-95"
              >
                <HeliosOrb state="idle" size={220} className="animate-float" />
              </button>
              <p className="mt-5 font-display font-bold tracking-[0.35em] text-ink text-xl">HELIOS</p>
            </div>

            <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto">
              <div className="glass-strong rounded-full p-1.5 flex items-center gap-2 glow-ring">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask HELIOS anything..."
                  className="flex-1 bg-transparent px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => navigate("/voice")}
                  aria-label="Voice"
                  className="p-2 rounded-full text-grey hover:text-cyan"
                >
                  <Icon name="mic" className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="w-9 h-9 rounded-full bg-gradient-to-r from-cyan to-violet text-navy flex items-center justify-center disabled:opacity-40"
                >
                  <Icon name="send" className="w-4 h-4" />
                </button>
              </div>
            </form>

            <div className="relative flex flex-wrap justify-center gap-2 mt-4">
              {chips.map((c) => (
                <button
                  key={c.label}
                  onClick={() => navigate(c.to)}
                  className="px-3.5 py-1.5 rounded-full glass text-[12px] text-grey hover:text-ink hover:border-cyan/40 transition-all"
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3 mt-8">
              {heroActions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className="glass rounded-2xl px-4 py-4 text-left hover:border-cyan/40 transition-all"
                >
                  <Icon name={a.icon} className="w-5 h-5 text-cyan mb-3" />
                  <p className="font-semibold text-sm text-ink">{a.label}</p>
                  <p className="text-[11px] text-faint mt-0.5">{a.hint}</p>
                </button>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-semibold text-sm text-ink">Today's Overview</h2>
                <button onClick={() => navigate("/tasks")} className="text-[11px] text-cyan">
                  View all
                </button>
              </div>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center justify-between text-grey">
                  <span>Tasks pending</span>
                  <span className="text-ink font-semibold">{pending.length}</span>
                </li>
                <li className="flex items-center justify-between text-grey">
                  <span>Reminders</span>
                  <span className="text-ink font-semibold">{reminders.length}</span>
                </li>
                <li className="flex items-center justify-between text-grey">
                  <span>Due today</span>
                  <span className="text-ink font-semibold">{dueToday.length}</span>
                </li>
              </ul>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="font-display font-semibold text-sm text-ink mb-3">Quick Actions</h2>
              <div className="space-y-2">
                {[
                  { label: "New Chat", icon: "chat", to: "/chat" },
                  { label: "Upload Document", icon: "upload", to: "/documents" },
                  { label: "Start Automation", icon: "zap", to: "/automation" },
                ].map((a) => (
                  <button
                    key={a.label}
                    onClick={() => navigate(a.to)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 glass hover:border-cyan/40 text-sm text-ink"
                  >
                    <Icon name={a.icon} className="w-4 h-4 text-cyan" />
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="font-display font-semibold text-sm text-ink mb-3">Recent Activity</h2>
              {activity.length === 0 ? (
                <p className="text-xs text-faint">No recent activity yet.</p>
              ) : (
                <ul className="space-y-3">
                  {activity.map((item, i) => (
                    <li key={`${item.title}-${i}`} className="flex items-start justify-between gap-3">
                      <span className="flex items-start gap-2 text-sm text-ink min-w-0">
                        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </span>
                      <span className="text-[11px] text-faint shrink-0">{item.when}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
