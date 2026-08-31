import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { AiOrb } from "@/components/AiOrb";
import { Icon } from "@/components/Icon";

interface QuickAction {
  label: string;
  icon: string;
  to: string;
  accent: string;
}

const quickActions: QuickAction[] = [
  { label: "Create a task", icon: "tasks", to: "/tasks", accent: "from-cyan/25 to-blue/10 text-cyan" },
  { label: "Save a memory", icon: "brain", to: "/memory", accent: "from-violet/25 to-violet/10 text-violet" },
  { label: "Search knowledge", icon: "search", to: "/documents", accent: "from-blue/25 to-blue/10 text-blue" },
  { label: "Start a chat", icon: "chat", to: "/chat", accent: "from-mint/25 to-mint/10 text-mint" },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Working late";
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  if (h < 21) return "Good Evening";
  return "Good Evening";
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [stats, setStats] = useState({ pendingTasks: 0, memories: 0, documents: 0 });

  const load = useCallback(async () => {
    const [tasks, memories, documents] = await Promise.allSettled([
      api.listTasks("pending"),
      api.listMemories(),
      api.listDocuments(),
    ]);
    setStats({
      pendingTasks: tasks.status === "fulfilled" ? tasks.value.length : 0,
      memories: memories.status === "fulfilled" ? memories.value.length : 0,
      documents: documents.status === "fulfilled" ? documents.value.length : 0,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const name = (user?.email?.split("@")[0] ?? "Operator").replace(/[._-]/g, " ");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    navigate("/chat", { state: { query: text } });
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {/* hero */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="animate-fade-up">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan mb-2 text-glow">
              Personal Assistant System
            </p>
            <h1 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight">
              {greeting()}, <span className="gradient-text capitalize">{name}</span>
            </h1>
            <p className="mt-3 text-grey max-w-xl leading-relaxed">
              I'm <span className="text-ink font-semibold">HELIOS</span>, your AI assistant.
              I remember what matters, keep your tasks in orbit, and find answers in your
              knowledge base.
            </p>

            {/* quick actions */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map((qa, i) => (
                <button
                  key={qa.label}
                  onClick={() => navigate(qa.to)}
                  style={{ animationDelay: `${i * 80}ms` }}
                  className="group glass rounded-xl p-3.5 text-left hover:border-cyan/40 hover:shadow-glow-sm transition-all animate-fade-up"
                >
                  <span
                    className={`inline-flex w-9 h-9 rounded-lg bg-gradient-to-br items-center justify-center mb-2 ${qa.accent}`}
                  >
                    <Icon name={qa.icon} className="w-5 h-5" />
                  </span>
                  <p className="text-sm font-semibold text-ink">{qa.label}</p>
                  <p className="text-[11px] text-faint mt-0.5 group-hover:text-grey transition-colors">
                    Open module →
                  </p>
                </button>
              ))}
            </div>

            {/* AI input */}
            <form onSubmit={handleSubmit} className="mt-6 max-w-xl">
              <div className="glass-strong rounded-2xl p-1.5 flex items-center gap-2 glow-ring">
                <span className="pl-3 text-cyan">
                  <Icon name="sparkles" className="w-5 h-5" />
                </span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Command HELIOS… e.g. remind me to call Ravi at 5 PM"
                  className="flex-1 bg-transparent px-1 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Voice input"
                  className="p-2.5 rounded-xl text-grey hover:text-cyan hover:bg-white/[0.06] transition-colors"
                >
                  <Icon name="mic" className="w-5 h-5" />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label="Send command"
                  className="p-2.5 rounded-xl bg-gradient-to-r from-cyan to-blue text-navy font-semibold shadow-glow-sm hover:brightness-110 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Icon name="send" className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                Try: "What's on my plate today?" · "Remind me tomorrow at 5 PM" · "Add a task to finish the report"
              </p>
            </form>
          </div>

          {/* orb */}
          <div className="flex flex-col items-center justify-center animate-fade-in">
            <AiOrb state="idle" size={200} className="animate-float" />
          </div>
        </div>

        {/* intelligence panel */}
        <div className="mt-8 sm:mt-10 grid md:grid-cols-3 gap-4">
          {/* at a glance */}
          <div className="glass rounded-2xl p-5 animate-fade-up">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-cyan shadow-glow-cyan" />
              <h2 className="font-display font-bold text-sm tracking-wide uppercase text-ink">
                At a Glance
              </h2>
            </div>
            <div className="space-y-3">
              {[
                { label: "Pending tasks", value: stats.pendingTasks, icon: "tasks", to: "/tasks", color: "text-cyan" },
                { label: "Saved memories", value: stats.memories, icon: "brain", to: "/memory", color: "text-violet" },
                { label: "Knowledge entries", value: stats.documents, icon: "book", to: "/documents", color: "text-blue" },
              ].map((row) => (
                <button
                  key={row.label}
                  onClick={() => navigate(row.to)}
                  className="w-full flex items-center justify-between rounded-xl px-3.5 py-3 glass hover:border-cyan/40 transition-all group"
                >
                  <span className="flex items-center gap-3">
                    <Icon name={row.icon} className={`w-5 h-5 ${row.color}`} />
                    <span className="text-sm text-grey group-hover:text-ink transition-colors">
                      {row.label}
                    </span>
                  </span>
                  <span className="font-display font-bold text-xl text-ink">{row.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* status */}
          <div className="glass rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "100ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-mint shadow-glow-sm" />
              <h2 className="font-display font-bold text-sm tracking-wide uppercase text-ink">
                System Status
              </h2>
            </div>
            <ul className="space-y-3">
              {[
                { label: "AI Core", value: "Online", color: "text-mint", icon: "sparkles" },
                { label: "Memory Bank", value: "Synced", color: "text-mint", icon: "database" },
                { label: "Knowledge Index", value: "Active", color: "text-mint", icon: "shield" },
                { label: "Automation", value: "Standby", color: "text-amber", icon: "zap" },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between rounded-xl px-3.5 py-3 glass">
                  <span className="flex items-center gap-3 text-sm text-grey">
                    <Icon name={row.icon} className="w-5 h-5 text-faint" />
                    {row.label}
                  </span>
                  <span className={`flex items-center gap-1.5 text-xs font-semibold ${row.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${row.color} shadow-glow-sm animate-blink`} />
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* suggestions */}
          <div className="glass rounded-2xl p-5 animate-fade-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-violet shadow-glow-violet" />
              <h2 className="font-display font-bold text-sm tracking-wide uppercase text-ink">
                Intelligence Feed
              </h2>
            </div>
            <div className="space-y-3">
              {[
                {
                  q: "What do you remember about me?",
                  hint: "Recall your saved memory bank",
                  icon: "brain",
                  color: "text-violet",
                },
                {
                  q: "What's on my plate today?",
                  hint: "Review pending tasks and reminders",
                  icon: "clock",
                  color: "text-cyan",
                },
                {
                  q: "Search my knowledge base",
                  hint: "Query indexed documents",
                  icon: "search",
                  color: "text-blue",
                },
              ].map((s) => (
                <button
                  key={s.q}
                  onClick={() => navigate("/chat", { state: { query: s.q } })}
                  className="w-full text-left rounded-xl px-3.5 py-3 glass hover:border-violet/40 hover:shadow-glow-violet transition-all group"
                >
                  <span className="flex items-start gap-3">
                    <Icon name={s.icon} className={`w-5 h-5 mt-0.5 ${s.color}`} />
                    <span>
                      <span className="block text-sm font-medium text-ink">{s.q}</span>
                      <span className="block text-[11px] text-faint mt-0.5">{s.hint}</span>
                    </span>
                  </span>
                </button>
              ))}
              <button
                onClick={() => navigate("/settings")}
                className="w-full flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 glass text-xs font-semibold text-grey hover:text-cyan hover:border-cyan/40 transition-all"
              >
                <Icon name="settings" className="w-4 h-4" />
                Customize HELIOS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
