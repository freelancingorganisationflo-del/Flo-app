import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMarkNotificationRead, useNotifications } from "@/hooks/useNotifications";

export function NotificationBell() {
  const { profile } = useAuth();
  const { data: notifications = [] } = useNotifications(profile?.id);
  const markRead = useMarkNotificationRead();
  const [open, setOpen] = useState(false);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-light text-base transition-colors hover:bg-border"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-auto rounded-card border border-border bg-white shadow-xl">
            <div className="border-b border-border px-4 py-3 text-[12px] font-bold uppercase tracking-wide text-navy">
              Notifications
            </div>
            {notifications.length === 0 && (
              <div className="px-4 py-6 text-center text-[13px] text-grey">You're all caught up.</div>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className={`block w-full border-b border-border px-4 py-3 text-left last:border-none hover:bg-light ${
                  n.read ? "opacity-60" : ""
                }`}
              >
                <div className="text-[13px] font-semibold text-navy">{n.title}</div>
                {n.message && <div className="mt-0.5 text-[12px] text-grey">{n.message}</div>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
