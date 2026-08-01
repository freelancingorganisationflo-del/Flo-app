import { NavLink } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  to: string;
  icon: string;
  label: string;
}

const isRootTab = (to: string) => to === "/dashboard" || to === "/admin";

export function MobileNav({
  navItems,
  open,
  onOpenChange,
}: {
  navItems: NavItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { profile, signOut } = useAuth();
  const primary = navItems.slice(0, 4);

  return (
    <>
      {/* Bottom tab bar */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Primary"
      >
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={isRootTab(item.to)}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
                isActive ? "text-teal" : "text-grey hover:text-navy"
              }`
            }
          >
            <span className="text-[18px] leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <button
          onClick={() => onOpenChange(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-semibold text-grey transition-colors hover:text-navy"
          aria-label="More menu"
        >
          <span className="text-[18px] leading-none">•••</span>
          More
        </button>
      </nav>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-[rgba(5,13,24,0.6)] backdrop-blur-sm lg:hidden"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Slide-in drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-[70] flex w-[82%] max-w-[320px] transform flex-col bg-navy2 shadow-2xl transition-transform duration-300 lg:hidden ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-label="Menu"
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="font-display text-xl font-black leading-none tracking-tight text-white">
            FL<span className="text-teal">O</span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-sm text-white/60 transition-colors hover:text-white"
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={isRootTab(item.to)}
              onClick={() => onOpenChange(false)}
              className={({ isActive }) =>
                `mb-1 flex items-center gap-3 rounded-[10px] px-3 py-3 text-[14px] transition-colors ${
                  isActive
                    ? "bg-tealDim font-bold text-teal"
                    : "font-medium text-white/50 hover:text-white/80"
                }`
              }
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="mb-2 truncate text-[13px] font-semibold text-white/70">
            {profile?.full_name}
          </div>
          <button
            onClick={() => void signOut()}
            className="w-full rounded-[10px] bg-white/[0.06] px-3 py-2.5 text-left text-[13px] font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}
