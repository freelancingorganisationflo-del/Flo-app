import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";

export function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy2 px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-tealBorder bg-navy p-8">
        <div className="mb-1 font-display text-2xl font-black text-white">
          FL<span className="text-teal">O</span>
        </div>
        <div className="mb-6 text-[13px] text-white/50">Sign in to continue learning.</div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[10px] border border-white/15 bg-white/[0.07] px-3.5 py-2.5 text-sm text-white outline-none focus:border-teal"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-white/70">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[10px] border border-white/15 bg-white/[0.07] px-3.5 py-2.5 text-sm text-white outline-none focus:border-teal"
            />
          </div>

          {error && <div className="rounded-lg bg-red/10 px-3 py-2 text-[12px] text-red">{error}</div>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-5 text-center text-[12px] text-white/40">
          New to FLO? <Link to="/signup" className="font-semibold text-teal">Create an account</Link>
        </div>
      </div>
    </div>
  );
}
