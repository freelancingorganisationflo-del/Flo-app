import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { to: "/chat", label: "Chat" },
  { to: "/tasks", label: "Tasks" },
  { to: "/memory", label: "Memory" },
  { to: "/documents", label: "Documents" },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="flex flex-col h-screen bg-light">
      <header className="shrink-0 bg-navy2 text-white">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal flex items-center justify-center text-navy2 font-black text-lg">
              H
            </div>
            <span className="font-display font-bold text-lg tracking-wide">HELIOS</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/60 hidden sm:block">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="text-xs px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 max-w-5xl w-full mx-auto flex flex-col">
        <Outlet />
      </main>

      <nav className="shrink-0 bg-white border-t border-border md:hidden">
        <div className="max-w-5xl mx-auto grid grid-cols-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `py-3 text-sm font-semibold text-center transition-colors ${
                  isActive ? "text-teal2" : "text-grey"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <aside className="hidden md:flex shrink-0">
        <nav className="w-full flex justify-center gap-6 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `text-sm font-semibold transition-colors ${
                  isActive ? "text-teal2" : "text-grey hover:text-flotext"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </div>
  );
}
