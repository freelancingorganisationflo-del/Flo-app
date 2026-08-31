import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { getSelectedModel, ModelPicker } from "@/components/ModelPicker";

function initials(email: string): string {
  return (email.split("@")[0] ?? "H").slice(0, 2).toUpperCase();
}

export function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ tasks: 0, memories: 0, documents: 0 });
  const [orbIntensity, setOrbIntensity] = useState(() => localStorage.getItem("helios_orb") ?? "high");
  const [animations, setAnimations] = useState(() => localStorage.getItem("helios_anim") !== "off");

  const load = useCallback(async () => {
    const [tasks, memories, documents] = await Promise.allSettled([
      api.listTasks(),
      api.listMemories(),
      api.listDocuments(),
    ]);
    setCounts({
      tasks: tasks.status === "fulfilled" ? tasks.value.length : 0,
      memories: memories.status === "fulfilled" ? memories.value.length : 0,
      documents: documents.status === "fulfilled" ? documents.value.length : 0,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setOrb(v: string) {
    setOrbIntensity(v);
    localStorage.setItem("helios_orb", v);
  }

  function toggleAnimations() {
    const next = !animations;
    setAnimations(next);
    localStorage.setItem("helios_anim", next ? "on" : "off");
    document.documentElement.style.colorScheme = next ? "dark" : "dark";
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <div className="animate-fade-up">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Settings</h1>
          <p className="text-sm text-grey mt-1">Configure your HELIOS interface and account.</p>
        </div>

        {/* profile */}
        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "60ms" }}>
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-lg shadow-glow-cyan">
              {user ? initials(user.email) : "H"}
            </span>
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-lg text-ink truncate">{user?.email}</h2>
              <p className="text-xs text-mint flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-mint shadow-glow-sm" />
                Operator · Plan: Unlimited Tokens
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {[
              { label: "Tasks", value: counts.tasks, icon: "tasks", color: "text-cyan" },
              { label: "Memories", value: counts.memories, icon: "brain", color: "text-violet" },
              { label: "Documents", value: counts.documents, icon: "book", color: "text-blue" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl glass px-3.5 py-3 flex items-center gap-3">
                <Icon name={s.icon} className={`w-4 h-4 ${s.color}`} />
                <div>
                  <p className="font-display font-bold text-lg text-ink leading-none">{s.value}</p>
                  <p className="text-[11px] text-faint mt-1">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* appearance */}
        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-cyan" />
            Appearance
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-ink mb-2">Core intensity</p>
              <div className="flex gap-2">
                {[
                  { v: "low", label: "Subtle" },
                  { v: "medium", label: "Balanced" },
                  { v: "high", label: "Maximal" },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => setOrb(o.v)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      orbIntensity === o.v
                        ? "bg-gradient-to-r from-cyan to-blue text-navy shadow-glow-sm"
                        : "glass text-grey hover:text-ink"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={toggleAnimations}
              className="w-full flex items-center justify-between rounded-xl glass px-4 py-3 hover:border-cyan/40 transition-all"
            >
              <span className="text-sm text-ink">Ambient animations & glow effects</span>
              <span
                className={`w-10 h-6 rounded-full p-0.5 transition-colors ${
                  animations ? "bg-cyan/70" : "bg-line"
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                    animations ? "translate-x-5" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </section>

        {/* assistant / model */}
        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "150ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-cyan" />
            AI Model
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm text-ink">Active model</p>
              <p className="text-xs text-faint mt-0.5">
                {getSelectedModel() && getSelectedModel() !== "auto"
                  ? getSelectedModel()
                  : "Auto"} · applied to new chat messages
              </p>
            </div>
            <ModelPicker />
          </div>
        </section>

        {/* danger zone */}
        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "180ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="shield" className="w-5 h-5 text-red" />
            Session
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={async () => {
                await signOut();
                navigate("/login");
              }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-red glass hover:bg-red/10 transition-all"
            >
              <Icon name="logout" className="w-4 h-4" />
              Sign out
            </button>
            <span className="text-xs text-faint self-center">
              Signing out clears your local session token. Your data stays synced to the HELIOS core.
            </span>
          </div>
        </section>

        <p className="text-center text-[11px] text-faint animate-fade-up">
          HELIOS v1.0 · React PWA · Deep-Space Interface
        </p>
      </div>
    </div>
  );
}
