import type { ReactNode } from "react";
import { isSupabaseConfigured } from "@/lib/supabase";

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-teal" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.5" fill="currentColor" />
      </svg>
    ),
    title: "Structured skill tracks",
    desc: "Master in-demand freelancing skills, one module at a time.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-teal" stroke="currentColor" strokeWidth="2">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
    ),
    title: "Real client projects",
    desc: "Build a portfolio of work while you learn.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-teal" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
    title: "Expert review",
    desc: "Every assignment is reviewed before your next module unlocks.",
  },
];

export function AuthLogo({ large = false }: { large?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-teal to-teal2 shadow-[0_10px_24px_-8px_rgba(0,217,184,0.65)] ${
          large ? "h-12 w-12" : "h-9 w-9"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" className={large ? "h-5 w-5" : "h-4 w-4"}>
          <path d="M8 5.5v13l11-6.5-11-6.5Z" fill="#0A1828" />
        </svg>
      </div>
      <div className="font-display text-2xl font-black tracking-tight text-white">
        FL<span className="text-teal">O</span>
      </div>
    </div>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-navy2 font-body">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[28rem] w-[28rem] rounded-full bg-teal/10 blur-[140px]" />
      <div className="pointer-events-none absolute right-[18%] top-1/3 h-72 w-72 rounded-full bg-orange/10 blur-[110px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <div className="relative z-10 mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 lg:grid-cols-[1.15fr_1fr] lg:px-10">
        <div className="hidden lg:block">
          <AuthLogo large />
          <h1 className="mt-9 font-display text-[44px] font-black leading-[1.04] tracking-tight text-white">
            Learn the skills
            <br />
            that <span className="text-teal">pay</span>.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">
            FLO is a private, membership-based learning organisation. Work through curated modules,
            submit real work, and unlock your next skill — one approved assignment at a time.
          </p>
          <div className="mt-9 space-y-5">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal/25 bg-teal/10">
                  {f.icon}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{f.title}</div>
                  <div className="mt-0.5 text-[12.5px] leading-snug text-white/50">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-[420px]">
          {!isSupabaseConfigured && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-orange/30 bg-orange/10 px-3.5 py-3">
              <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 shrink-0 text-orange" stroke="currentColor" strokeWidth="2">
                <path d="M12 3 2.5 20h19L12 3Z" />
                <path d="M12 9.5v4M12 16.5h.01" />
              </svg>
              <div className="text-[12px] leading-relaxed text-white/70">
                <span className="font-bold text-orange">Backend not connected.</span> Add{" "}
                <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white/90">VITE_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white/90">VITE_SUPABASE_ANON_KEY</code>{" "}
                in the project's <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-white/90">.env</code> file,
                then restart the dev server.
              </div>
            </div>
          )}
          <div className="mb-8 lg:hidden">
            <AuthLogo large />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
