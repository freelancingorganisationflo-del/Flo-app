import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { api, effectiveVoice, friendlyVoice, getSavedVoice, setSavedVoice, type ProviderRoute } from "@/lib/api";
import { Icon } from "@/components/Icon";
import { getSelectedModel, ModelPicker } from "@/components/ModelPicker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isStandalone } from "@/lib/pwa";

function initials(email: string): string {
  return (email.split("@")[0] ?? "H").slice(0, 2).toUpperCase();
}

export function Settings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ tasks: 0, memories: 0, documents: 0 });
  const [voices, setVoices] = useState<string[]>([]);
  const [voice, setVoice] = useState<string>(() => getSavedVoice() ?? "");
  const [previewing, setPreviewing] = useState(false);
  const [providers, setProviders] = useState<{ llm: ProviderRoute[]; voice: ProviderRoute[] }>({
    llm: [],
    voice: [],
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const standalone = isStandalone();

  const loadVoice = useCallback(async () => {
    const cfg = await api.getVoiceConfig();
    const catalog = cfg.tts_voices ?? [];
    setVoices(catalog);
    const saved = getSavedVoice();
    const target = saved && catalog.includes(saved) ? saved : effectiveVoice(cfg.tts_voice) || "";
    if (saved && target !== saved) {
      setSavedVoice(target);
    }
    setVoice(target);
  }, []);

  useEffect(() => {
    loadVoice().catch(() => {
      // voice endpoints unavailable; leave defaults
    });
  }, [loadVoice]);

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

  useEffect(() => {
    api
      .getProviders()
      .then(setProviders)
      .catch(() => {
        setProviders({ llm: [], voice: [] });
      });
  }, []);

  function selectVoice(v: string) {
    setVoice(v);
    setSavedVoice(v);
  }

  async function previewVoice() {
    audioRef.current?.pause();
    setPreviewing(true);
    try {
      const url = await api.tts("Hello, I am HELIOS. How can I help you today?", voice);
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          audioRef.current = null;
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          audioRef.current = null;
          URL.revokeObjectURL(url);
          resolve();
        };
        void audio.play();
      });
    } catch {
      // preview failed; keep current voice
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        <div className="animate-fade-up">
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-ink">Settings</h1>
          <p className="text-sm text-grey mt-1">Profile, model, appearance, and system.</p>
        </div>

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

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="sparkles" className="w-5 h-5 text-cyan" />
            Appearance
          </h2>
          <div className="flex items-center justify-between rounded-xl glass px-4 py-3">
            <div>
              <p className="text-sm text-ink">Theme</p>
              <p className="text-xs text-faint mt-0.5">Light and dark persist after refresh</p>
            </div>
            <ThemeToggle />
          </div>
        </section>

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "165ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="volume" className="w-5 h-5 text-cyan" />
            HELIOS Voice
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm text-ink mb-2" htmlFor="voice-select">
                Voice
              </label>
              <select
                id="voice-select"
                value={voice}
                onChange={(e) => selectVoice(e.target.value)}
                className="w-full rounded-lg glass px-3 py-2.5 text-sm text-ink outline-none border border-line focus:border-cyan/50 transition-colors [&>option]:bg-navy3"
              >
                {voices.length === 0 && <option value="">Loading voices…</option>}
                {voices.map((v) => (
                  <option key={v} value={v}>
                    {friendlyVoice(v)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={previewVoice}
              disabled={!voice || previewing}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold glass text-grey hover:text-cyan hover:border-cyan/40 disabled:opacity-40 transition-all"
            >
              <Icon name="volume" className="w-4 h-4" />
              {previewing ? "Speaking…" : "Preview"}
            </button>
          </div>
          <p className="text-xs text-faint mt-3">
            {voices.length > 0 && voice ? (
              <>Playing “{friendlyVoice(voice)}” on HELIOS pages · unlimited neural TTS, no quota.</>
            ) : (
              <>Loading voice catalogue…</>
            )}
          </p>
        </section>

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "150ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="shield" className="w-5 h-5 text-cyan" />
            Providers
          </h2>
          <p className="text-xs text-faint mb-4">
            Keys stay on the server. Status shows provider, model, and whether a key is configured.
          </p>
          <div className="space-y-2">
            {[...providers.llm, ...providers.voice].map((route) => (
              <div
                key={route.task}
                className="flex items-center justify-between gap-3 rounded-xl glass px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-ink capitalize">{route.task}</p>
                  <p className="text-xs text-faint truncate mt-0.5">
                    {route.provider || "openai-compatible"} · {route.model || "unset"}
                    {route.host ? ` · ${route.host}` : ""}
                  </p>
                </div>
                <span
                  className={`text-[11px] font-semibold shrink-0 ${
                    route.configured ? "text-mint" : "text-faint"
                  }`}
                >
                  {route.configured ? "Configured" : "Not configured"}
                </span>
              </div>
            ))}
            {providers.llm.length === 0 && providers.voice.length === 0 && (
              <p className="text-xs text-faint">Provider status unavailable.</p>
            )}
          </div>
        </section>

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "155ms" }}>
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

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up" style={{ animationDelay: "170ms" }}>
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="download" className="w-5 h-5 text-cyan" />
            Web app
          </h2>
          <p className="text-sm text-grey">
            {standalone
              ? "Helios is running as an installed app on this device."
              : "Install Helios on your home screen. Chrome and Edge show an Install button; on iPhone use Share, then Add to Home Screen."}
          </p>
        </section>

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

        <section className="glass rounded-2xl p-5 sm:p-6 animate-fade-up">
          <h2 className="font-display font-semibold text-lg text-ink mb-4 flex items-center gap-2">
            <Icon name="info" className="w-5 h-5 text-cyan" />
            System Info
          </h2>
          <ul className="space-y-2 text-sm text-grey">
            <li className="flex justify-between"><span>HELIOS</span><span className="text-ink">v1.0</span></li>
            <li className="flex justify-between"><span>Frontend</span><span className="text-ink">React + Vite</span></li>
            <li className="flex justify-between"><span>Database</span><span className="text-ink">SQLite</span></li>
            <li className="flex items-center justify-between">
              <span>Status</span>
              <span className="text-mint flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-mint" />
                All Systems Operational
              </span>
            </li>
          </ul>
        </section>

        <p className="text-center text-[11px] text-faint animate-fade-up">
          HELIOS v1.0 · Installable web app · Premium workspace
        </p>
      </div>
    </div>
  );
}
