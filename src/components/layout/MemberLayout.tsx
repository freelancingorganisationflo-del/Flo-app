import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
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
  return (
    <div className="flex h-screen overflow-hidden bg-light font-body">
      <Sidebar navItems={navItems} />
      <div className="flex-1 overflow-auto">
        <div className="flex justify-end px-8 pt-6">
          <NotificationBell />
        </div>
        <div className="px-8 pb-10 pt-2">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
