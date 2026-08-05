import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell } from "@/components/auth/AuthShell";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-white/35" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px] text-white/35" stroke="currentColor" strokeWidth="1.8">
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-[18px] w-[18px]" stroke="currentColor" strokeWidth="1.8">
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-3.2 3.9M6.5 6.6C4 8.2 3 10.7 3 12c0 2.5 4 7 9 7a9.7 9.7 0 0 0 3.6-.7" />
        </>
      ) : (
        <>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session && profile) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-11 pr-11 text-sm text-white placeholder-white/30 outline-none transition focus:border-teal/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-teal/20";

  return (
    <AuthShell>
      <div className="rounded-2xl bg-gradient-to-b from-teal/40 via-white/10 to-transparent p-px shadow-[0_24px_70px_-20px_rgba(0,217,184,0.35)]">
        <div className="rounded-2xl bg-navy2/80 px-7 py-9 backdrop-blur-xl sm:px-9">
          <div className="mb-1 font-display text-[22px] font-black tracking-tight text-white sm:hidden">
            Welcome <span className="text-teal">back</span>
          </div>
          <div className="hidden sm:block">
            <div className="font-display text-[22px] font-black tracking-tight text-white">
              Welcome <span className="text-teal">back</span>
            </div>
            <div className="mt-1 text-[13px] text-white/50">Sign in to continue your learning journey.</div>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Email</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Password</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                  <LockIcon />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition hover:text-teal"
                >
                  <EyeIcon off={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red/20 bg-red/10 px-3 py-2 text-[12px] text-red">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-teal to-teal2 px-4 py-3 text-sm font-extrabold text-navy shadow-[0_14px_34px_-12px_rgba(0,217,184,0.7)] transition hover:shadow-[0_16px_40px_-10px_rgba(0,217,184,0.85)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="relative z-10">{submitting ? "Signing in…" : "Sign in to FLO"}</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            </button>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] font-medium tracking-wide text-white/35">PRIVATE MEMBERSHIP</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <div className="mt-5 text-center text-[12.5px] text-white/45">
            New to FLO?{" "}
            <Link to="/signup" className="font-bold text-teal transition hover:text-white">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
