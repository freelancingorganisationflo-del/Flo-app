import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AuthShell } from "@/components/auth/AuthShell";

export function Signup() {
  const { signUp, session, profile, loading } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session && profile) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { error } = await signUp(email, password, fullName);
      if (error) setError(error);
      else setDone(true);
    } catch {
      setError("Something went wrong. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="rounded-2xl bg-gradient-to-b from-teal/40 via-white/10 to-transparent p-px">
          <div className="rounded-2xl bg-navy2/80 px-7 py-12 text-center backdrop-blur-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/15">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-teal" stroke="currentColor" strokeWidth="2.2">
                <path d="m4 12.5 5 5L20 6.5" />
              </svg>
            </div>
            <div className="font-display text-lg font-extrabold text-white">Check your email</div>
            <p className="mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-white/50">
              Confirm your address, then an admin will assign your skill track and you'll be in.
            </p>
            <Link to="/login" className="mt-6 inline-block text-[13px] font-bold text-teal">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthShell>
    );
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-teal/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-teal/20";

  return (
    <AuthShell>
      <div className="rounded-2xl bg-gradient-to-b from-teal/40 via-white/10 to-transparent p-px shadow-[0_24px_70px_-20px_rgba(0,217,184,0.35)]">
        <div className="rounded-2xl bg-navy2/80 px-7 py-9 backdrop-blur-xl sm:px-9">
          <div className="font-display text-[22px] font-black tracking-tight text-white">
            Apply for a <span className="text-teal">founding</span> spot
          </div>
          <div className="mt-1 text-[13px] text-white/50">Limited seats. Build your skills the FLO way.</div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Full name</label>
              <input
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className={inputClass}
              />
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
              <span className="relative z-10">{submitting ? "Creating account…" : "Create account"}</span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-500 group-hover:translate-x-full" />
            </button>
          </form>

          <div className="mt-6 text-center text-[12.5px] text-white/45">
            Already a member?{" "}
            <Link to="/login" className="font-bold text-teal transition hover:text-white">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
