import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/Spinner";
import { Icon } from "@/components/Icon";

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from =
    (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/dashboard";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await signIn(email, password);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy px-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-aurora" aria-hidden="true" />
      <div className="fixed inset-0 pointer-events-none bg-grid opacity-40" aria-hidden="true" />
      <div className="relative w-full max-w-sm animate-fade-up">
        <div className="mb-8 text-center">
          <div className="relative w-14 h-14 mx-auto mb-4">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan via-blue to-violet shadow-glow-cyan animate-pulse-glow" />
            <div className="absolute inset-[3px] rounded-2xl bg-navy flex items-center justify-center">
              <span className="gradient-text font-display font-black text-2xl">H</span>
            </div>
          </div>
          <h1 className="font-display font-bold text-2xl text-ink">Welcome back</h1>
          <p className="text-sm text-grey mt-1">Sign in to HELIOS</p>
        </div>
        <form onSubmit={handleSubmit} className="glass-strong rounded-2xl p-6 shadow-panel space-y-4 glow-ring">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-ink mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-dark"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-ink mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-dark"
            />
          </div>
          {error && (
            <p className="text-sm text-red bg-red/10 border border-red/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg btn-primary flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            Sign in
          </button>
        </form>
        <p className="text-center text-sm text-grey mt-4">
          No account?{" "}
          <Link to="/signup" className="text-cyan hover:underline">
            Create one
          </Link>
        </p>
        <p className="text-center text-[11px] text-faint mt-6 flex items-center justify-center gap-1.5">
          <Icon name="shield" className="w-3 h-3" />
          HELIOS Core · Secure session
        </p>
      </div>
    </div>
  );
}
