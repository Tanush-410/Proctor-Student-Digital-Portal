import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, Inbox, X } from "lucide-react";
import { api } from "../api/client";

interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationRow({ n, onClick }: { n: Notification; onClick: (n: Notification) => void }) {
  return (
    <li>
      <button
        onClick={() => onClick(n)}
        className={`flex w-full flex-col items-start gap-0.5 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 ${!n.read ? "bg-brand-50/40" : ""}`}
      >
        <div className="flex w-full items-center gap-2">
          {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
          <span className="truncate text-[13px] font-medium text-slate-800">{n.title}</span>
        </div>
        {n.body && <span className="line-clamp-2 pl-3.5 text-xs text-slate-500">{n.body}</span>}
        <span className="pl-3.5 text-[11px] text-slate-400">{timeAgo(n.createdAt)}</span>
      </button>
    </li>
  );
}

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  function load() {
    api.get("/notifications").then((res) => {
      setItems(res.items);
      setUnreadCount(res.unreadCount);
    });
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function markAllRead() {
    await api.post("/notifications/read-all");
    load();
  }

  async function handleClick(n: Notification) {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`);
      load();
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  const unread = items.filter((n) => !n.read);
  const earlier = items.filter((n) => n.read);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2 items-center justify-center rounded-full bg-crimson-500 ring-2 ring-white" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Notifications">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-popover"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-900">Notifications</h2>
                  <p className="text-xs text-slate-400">{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}</p>
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 hover:text-brand-700"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-5 py-16 text-center">
                    <Inbox className="h-7 w-7 text-slate-300" />
                    <p className="text-sm text-slate-400">Nothing yet.</p>
                  </div>
                ) : (
                  <>
                    {unread.length > 0 && (
                      <div>
                        <div className="sticky top-0 z-10 bg-white/95 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-600 backdrop-blur">New</div>
                        <ul className="divide-y divide-slate-100">
                          {unread.map((n) => (
                            <NotificationRow key={n.id} n={n} onClick={handleClick} />
                          ))}
                        </ul>
                      </div>
                    )}
                    {earlier.length > 0 && (
                      <div>
                        <div className="sticky top-0 z-10 bg-white/95 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">Earlier</div>
                        <ul className="divide-y divide-slate-100">
                          {earlier.map((n) => (
                            <NotificationRow key={n.id} n={n} onClick={handleClick} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
