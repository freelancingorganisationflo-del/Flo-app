import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { NotificationBell } from "./NotificationBell";

const navItems = [
  { to: "/admin", icon: "📊", label: "Dashboard" },
  { to: "/admin/members", icon: "👥", label: "Members" },
  { to: "/admin/curriculum", icon: "📚", label: "Curriculum" },
  { to: "/admin/submissions", icon: "✅", label: "Submissions" },
  { to: "/admin/checkins", icon: "📝", label: "Check-ins" },
  { to: "/admin/resources", icon: "🧰", label: "Resources" },
  { to: "/admin/leaderboard", icon: "🏆", label: "Leaderboard" },
];

export function AdminLayout() {
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
