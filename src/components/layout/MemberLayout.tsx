import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { NotificationBell } from "./NotificationBell";

const navItems = [
  { to: "/dashboard", icon: "📊", label: "Dashboard" },
  { to: "/learning", icon: "📚", label: "Learning" },
  { to: "/checkins", icon: "📝", label: "Check-ins" },
  { to: "/resources", icon: "🧰", label: "Resources" },
  { to: "/leaderboard", icon: "🏆", label: "Leaderboard" },
  { to: "/profile", icon: "👤", label: "Profile" },
];

export function MemberLayout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-light font-body">
      <Sidebar navItems={navItems} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:hidden">
          <div className="font-display text-lg font-black tracking-tight text-navy">
            FL<span className="text-teal">O</span>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <button
              onClick={() => setMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-light text-lg text-navy transition-colors hover:bg-border"
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto px-4 pb-24 pt-4 sm:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>

      <MobileNav navItems={navItems} open={menuOpen} onOpenChange={setMenuOpen} />
    </div>
  );
}
