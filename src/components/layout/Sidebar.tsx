import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

export function Sidebar({ navItems, footer }: { navItems: NavItem[]; footer?: ReactNode }) {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex h-screen w-[220px] shrink-0 flex-col overflow-hidden bg-navy2">
      {/* Logo */}
      <div className="border-b border-white/[0.06] px-[1.4rem] pb-4 pt-6">
        <div className="font-display text-2xl font-black leading-none tracking-tight text-white">
          FL<span className="text-teal">O</span>
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-wider text-white/30">Freelancing Organisation</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-[0.7rem] py-3">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mb-1 flex w-full items-center gap-3 rounded-[10px] px-3 py-[0.7rem] text-left text-[13px] transition-colors ${
                isActive ? "bg-tealDim font-bold text-teal" : "font-medium text-white/50 hover:text-white/80"
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      {footer}

      {/* Profile / sign out */}
      <div className="mx-2 mb-2 border-t border-white/[0.06] px-3 pt-3">
        <div className="mb-2 truncate text-[12px] font-semibold text-white/70">{profile?.full_name}</div>
        <button
          onClick={() => void signOut()}
          className="w-full rounded-[8px] bg-white/[0.06] px-3 py-2 text-left text-[12px] font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
