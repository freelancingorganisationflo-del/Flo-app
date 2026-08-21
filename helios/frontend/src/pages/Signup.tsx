import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Spinner } from "@/components/Spinner";

export function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    const res = await signUp(email, password);
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    navigate("/chat", { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy2 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-teal flex items-center justify-center text-navy2 font-black text-2xl mb-3">
            H
          </div>
          <h1 className="font-display font-bold text-2xl text-white">Create your account</h1>
          <p className="text-sm text-white/50 mt-1">Your personal assistant awaits</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-card p-6 shadow-lg space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-flotext mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-flotext mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-semibold text-flotext mb-1">
              Confirm password
            </label>
            <input
              id="confirm"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-border focus:border-teal focus:outline-none"
            />
          </div>
          {error && (
            <p className="text-sm text-red bg-red/5 border border-red/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-lg bg-teal text-navy2 font-semibold hover:bg-teal2 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Spinner className="w-4 h-4" />}
            Create account
          </button>
        </form>
        <p className="text-center text-sm text-white/50 mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-teal hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
