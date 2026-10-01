import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: "home" },
  { to: "/chat", label: "Chat", icon: "chat" },
  { to: "/code", label: "Code", icon: "code" },
  { to: "/search", label: "Search", icon: "search" },
  { to: "/vision", label: "Vision", icon: "eye" },
  { to: "/voice", label: "Voice", icon: "mic" },
  { to: "/memory", label: "Memory", icon: "brain" },
  { to: "/tasks", label: "Tasks", icon: "tasks" },
  { to: "/documents", label: "Documents", icon: "book" },
  { to: "/automation", label: "Automation", icon: "zap" },
];

const mobileNav = navItems.filter((n) =>
  ["/dashboard", "/chat", "/search", "/tasks", "/code"].includes(n.to)
);

function initials(email: string): string {
  const name = email.split("@")[0] ?? "H";
  return name.slice(0, 1).toUpperCase();
}

function displayName(email?: string): string {
  if (!email) return "Operator";
  return (email.split("@")[0] ?? "Operator").replace(/[._-]/g, " ");
}

function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
      <div className="relative w-8 h-8 shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan via-blue to-violet shadow-glow-sm" />
        <div className="absolute inset-[2px] rounded-full bg-navy3 flex items-center justify-center">
          <span className="gradient-text font-display font-black text-sm leading-none">H</span>
        </div>
      </div>
      {!collapsed && (
        <span className="font-display font-bold text-[15px] tracking-[0.22em] text-ink">
          HELIOS
        </span>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("helios_sidebar") === "collapsed"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("helios_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const renderNav = (isDrawer: boolean, isCollapsed: boolean) => (
    <div className={isCollapsed && !isDrawer ? "space-y-1" : "space-y-0.5"}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          title={item.label}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all ${
              isCollapsed && !isDrawer ? "justify-center px-0 py-2.5 mx-auto w-10" : "px-3 py-2"
            } ${
              isActive
                ? "text-cyan bg-cyan/[0.10] shadow-glow-sm"
                : "text-grey hover:text-ink hover:bg-white/[0.04]"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                name={item.icon}
                className={`w-[18px] h-[18px] shrink-0 ${
                  isActive ? "text-cyan" : "text-grey group-hover:text-ink"
                }`}
              />
              {(!isCollapsed || isDrawer) && <span className="truncate">{item.label}</span>}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col bg-navy text-ink overflow-hidden relative">
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(50% 40% at 18% 0%, color-mix(in srgb, var(--primary) 14%, transparent), transparent 60%), radial-gradient(40% 40% at 90% 8%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 55%)",
        }}
      />

      <div className="relative z-10 flex flex-1 min-h-0">
        <aside
          className={`hidden lg:flex flex-col shrink-0 border-r border-line glass-strong transition-all duration-300 ${
            collapsed ? "w-[76px]" : "w-[220px]"
          }`}
        >
          <div className={`flex items-center h-16 px-4 ${collapsed ? "justify-center" : "justify-between"}`}>
            <Logo collapsed={collapsed} />
            {!collapsed && (
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-faint hover:text-ink hover:bg-white/[0.06]"
              >
                <Icon name="chevron-left" className="w-4 h-4" />
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="mx-auto mb-2 p-1.5 rounded-lg text-faint hover:text-ink hover:bg-white/[0.06]"
            >
              <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1 overflow-y-auto scrollbar-slim px-2.5 py-2">
            {renderNav(false, collapsed)}
          </div>
          <div className="shrink-0 border-t border-line p-2.5 space-y-1">
            <NavLink
              to="/settings"
              title="Settings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl text-[13px] font-medium transition-all ${
                  collapsed ? "justify-center px-0 py-2.5 w-10 mx-auto" : "px-3 py-2"
                } ${isActive ? "text-cyan bg-cyan/[0.10]" : "text-grey hover:text-ink hover:bg-white/[0.04]"}`
              }
            >
              <Icon name="settings" className="w-[18px] h-[18px]" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
            {collapsed ? (
              <button
                onClick={() => navigate("/settings")}
                className="flex justify-center w-full py-1"
                aria-label="Profile"
              >
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-xs">
                  {user ? initials(user.email) : "H"}
                </span>
              </button>
            ) : (
              <button
                onClick={() => navigate("/settings")}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/[0.04] transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-xs shrink-0">
                  {user ? initials(user.email) : "H"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink truncate capitalize">
                    {displayName(user?.email)}
                  </p>
                  <p className="text-[11px] text-faint">Pro User</p>
                </div>
              </button>
            )}
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <header className="lg:hidden shrink-0 flex items-center gap-3 px-4 h-14 border-b border-line glass-strong">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="p-2 rounded-lg text-grey hover:text-ink"
            >
              <Icon name="menu" className="w-5 h-5" />
            </button>
            <Logo />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle compact />
            </div>
          </header>
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
            <Outlet />
          </main>
        </div>
      </div>

      <nav className="relative z-30 lg:hidden shrink-0 glass-strong border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {mobileNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive ? "text-cyan" : "text-grey"
                }`
              }
            >
              <Icon name={item.icon} className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 glass-strong border-r border-line flex flex-col animate-fade-in">
            <div className="flex items-center justify-between px-4 h-16 border-b border-line">
              <Logo />
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-lg text-grey hover:text-ink"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-slim px-3 py-3">{renderNav(true, false)}</div>
            <div className="shrink-0 border-t border-line p-3 space-y-2">
              <NavLink
                to="/settings"
                className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-grey hover:text-ink"
              >
                <Icon name="settings" className="w-4 h-4" />
                Settings
              </NavLink>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red hover:bg-red/10"
              >
                <Icon name="logout" className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
