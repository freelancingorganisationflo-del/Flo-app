import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";

interface NavItem {
  to: string;
  label: string;
  icon: string;
  section: "Main" | "Workspace" | "System";
}

const navItems: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: "home", section: "Main" },
  { to: "/chat", label: "Chat", icon: "chat", section: "Main" },
  { to: "/memory", label: "Memory", icon: "brain", section: "Main" },
  { to: "/tasks", label: "Tasks", icon: "tasks", section: "Main" },
  { to: "/search", label: "Web Search", icon: "globe", section: "Workspace" },
  { to: "/documents", label: "Knowledge Base", icon: "book", section: "Workspace" },
  { to: "/tools", label: "Tools & Skills", icon: "tools", section: "Workspace" },
  { to: "/automation", label: "Automation", icon: "zap", section: "Workspace" },
  { to: "/calendar", label: "Calendar", icon: "calendar", section: "Workspace" },
  { to: "/files", label: "Files", icon: "folder", section: "System" },
  { to: "/analytics", label: "Analytics", icon: "analytics", section: "System" },
  { to: "/settings", label: "Settings", icon: "settings", section: "System" },
];

const mobileNav = navItems.filter((n) =>
  ["dashboard", "chat", "search", "tasks", "memory"].includes(n.to.slice(1))
);

function initials(email: string): string {
  const name = email.split("@")[0] ?? "H";
  return name.slice(0, 2).toUpperCase();
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative w-9 h-9 shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan via-blue to-violet shadow-glow-cyan animate-pulse-glow" />
        <div className="absolute inset-[3px] rounded-full bg-navy flex items-center justify-center">
          <span className="gradient-text font-display font-black text-lg leading-none">H</span>
        </div>
      </div>
      <span className="font-display font-bold text-lg tracking-[0.18em] text-ink">
        HELIOS
      </span>
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [query, setQuery] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem("helios_sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  useEffect(() => {
    setProfileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setQuery("");
    navigate("/chat", { state: { query: q } });
  }

  const renderNav = (isDrawer: boolean, isCollapsed: boolean) =>
    (["Main", "Workspace", "System"] as const).map((section) => (
      <div key={section} className={isCollapsed && !isDrawer ? "mt-4" : "mt-5"}>
        {(!isCollapsed || isDrawer) && (
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-faint mb-1.5">
            {section}
          </p>
        )}
        <div className={isCollapsed && !isDrawer ? "space-y-1" : "space-y-0.5"}>
          {navItems
            .filter((n) => n.section === section)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all ${
                    isCollapsed && !isDrawer ? "justify-center px-0 py-2.5 mx-auto w-10" : "px-3 py-2"
                  } ${
                    isActive
                      ? "text-cyan bg-cyan/[0.08] shadow-glow-sm"
                      : "text-grey hover:text-ink hover:bg-white/[0.04]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && !isCollapsed && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-gradient-to-b from-cyan to-violet shadow-glow-cyan" />
                    )}
                    <Icon
                      name={item.icon}
                      className={`w-[18px] h-[18px] shrink-0 ${
                        isActive ? "text-cyan" : "text-grey group-hover:text-ink"
                      }`}
                    />
                    {(!isCollapsed || isDrawer) && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
        </div>
      </div>
    ));

  return (
    <div className="h-screen flex flex-col bg-navy text-ink overflow-hidden relative">
      {/* ambient background layers */}
      <div className="fixed inset-0 pointer-events-none bg-aurora" aria-hidden="true" />
      <div className="fixed inset-0 pointer-events-none bg-grid opacity-50" aria-hidden="true" />

      {/* top bar */}
      <header className="relative z-30 shrink-0 glass-strong border-b border-line">
        <div className="flex items-center gap-3 px-4 h-16">
          <button
            onClick={() => {
              if (window.innerWidth < 1024) setDrawerOpen(true);
              else setCollapsed((c) => !c);
            }}
            aria-label="Toggle navigation"
            className="p-2 rounded-lg text-grey hover:text-ink hover:bg-white/[0.06] transition-colors lg:hidden"
          >
            <Icon name="menu" className="w-5 h-5" />
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label="Collapse sidebar"
            className="hidden lg:flex p-2 rounded-lg text-grey hover:text-ink hover:bg-white/[0.06] transition-colors"
          >
            <Icon
              name={collapsed ? "chevron-right" : "chevron-left"}
              className="w-5 h-5"
            />
          </button>

          <div className="hidden sm:block">
            <Logo />
          </div>

          <form onSubmit={handleSearch} className="flex-1 flex justify-center min-w-0">
            <div className="relative w-full max-w-xl group">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint group-focus-within:text-cyan transition-colors">
                <Icon name="search" className="w-4 h-4" />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search anything…"
                className="w-full pl-10 pr-4 py-2 rounded-xl glass text-sm text-ink placeholder:text-faint focus:outline-none focus:border-cyan/50 focus:shadow-glow-sm border border-transparent transition-all"
              />
            </div>
          </form>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass text-[11px] font-semibold text-mint tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-mint shadow-glow-sm animate-blink" />
              HELIOS Online
            </span>

            {/* voice */}
            <button
              onClick={() => setListening((l) => !l)}
              aria-label="Voice input"
              className={`relative p-2.5 rounded-xl transition-all ${
                listening
                  ? "text-navy bg-gradient-to-r from-cyan to-blue shadow-glow-cyan"
                  : "text-grey hover:text-cyan hover:bg-white/[0.06]"
              }`}
            >
              <Icon name="mic" className="w-5 h-5" />
              {listening && (
                <span className="absolute inset-0 rounded-xl border border-cyan/50 animate-[orb-ring_1.8s_ease-out_infinite]" />
              )}
            </button>

            {/* notifications */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen((o) => !o)}
                aria-label="Notifications"
                className="p-2.5 rounded-xl text-grey hover:text-ink hover:bg-white/[0.06] transition-colors"
              >
                <Icon name="bell" className="w-5 h-5" />
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-72 glass-strong rounded-xl p-1.5 shadow-panel border border-line animate-fade-in">
                  <p className="px-3 py-2 text-xs font-semibold text-faint uppercase tracking-widest">
                    Notifications
                  </p>
                  <div className="px-3 py-4 text-center text-sm text-grey">
                    All systems nominal. No new notifications.
                  </div>
                </div>
              )}
            </div>

            {/* profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((o) => !o)}
                aria-label="Profile menu"
                className="flex items-center gap-2 p-1 pr-2 rounded-xl glass hover:border-cyan/40 transition-all"
              >
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-xs">
                  {user ? initials(user.email) : "H"}
                </span>
                <span className="hidden xl:inline-flex items-center gap-1 text-xs text-grey">
                  {user?.email}
                  <Icon name="chevron-down" className="w-3.5 h-3.5" />
                </span>
              </button>
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 glass-strong rounded-xl p-1.5 shadow-panel border border-line animate-fade-in">
                  <div className="px-3 py-2.5 border-b border-line mb-1">
                    <p className="text-sm font-semibold text-ink truncate">{user?.email}</p>
                    <p className="text-[11px] text-faint mt-0.5">Operator · HELIOS Core</p>
                  </div>
                  <NavLink
                    to="/settings"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-grey hover:text-ink hover:bg-white/[0.05] transition-colors"
                  >
                    <Icon name="settings" className="w-4 h-4" />
                    Settings
                  </NavLink>
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red hover:bg-red/10 transition-colors"
                  >
                    <Icon name="logout" className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 min-h-0">
        {/* desktop sidebar */}
        <aside
          className={`hidden lg:flex flex-col shrink-0 border-r border-line glass-strong transition-all duration-300 ${
            collapsed ? "w-[84px]" : "w-64"
          }`}
        >
          <div className="flex-1 overflow-y-auto scrollbar-slim px-3 py-4">
            {renderNav(false, collapsed)}
          </div>
          <div className="shrink-0 border-t border-line p-3">
            {collapsed ? (
              <div className="flex justify-center">
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-xs">
                  {user ? initials(user.email) : "H"}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5">
                <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan to-violet flex items-center justify-center text-navy font-bold text-xs">
                  {user ? initials(user.email) : "H"}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-ink truncate">
                    {user?.email?.split("@")[0] ?? "Operator"}
                  </p>
                  <p className="text-[11px] text-mint flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-mint" />
                    Synced
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* main */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Outlet />
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="relative z-30 lg:hidden shrink-0 glass-strong border-t border-line">
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
              <Icon
                name={item.icon}
                className={`w-5 h-5 ${location.pathname === item.to ? "drop-shadow-[0_0_6px_rgba(46,230,255,0.8)]" : ""}`}
              />
              {item.label.split(" ")[0]}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* mobile drawer */}
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
                className="p-2 rounded-lg text-grey hover:text-ink hover:bg-white/[0.06]"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-slim px-3 py-3">
              {renderNav(true, false)}
            </div>
            <div className="shrink-0 border-t border-line p-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red hover:bg-red/10 transition-colors"
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
