import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, Search, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Avatar, Badge } from "../components/ui";
import { NotificationBell } from "../components/NotificationBell";
import { CommandPalette, useCommandPaletteShortcut } from "../components/CommandPalette";

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

export default function PortalLayout({ tabs, portalName }: { tabs: Tab[]; portalName: string }) {
  const { auth, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteShortcut(() => setPaletteOpen(true));

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  if (!auth) return null;

  const displayName = auth.profile.name;
  const roleTone = auth.role === "ADMIN" ? "blue" : auth.role === "PROCTOR" ? "amber" : "green";

  const sidebarContent = (
    <>
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-soft ring-1 ring-slate-200/80">
          <img src="/bms-logo.svg" alt="BMSCE" className="h-11 w-11" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-slate-900">Proctor Diary</div>
          <div className="truncate text-xs text-slate-400">{portalName}</div>
        </div>
      </div>

      {auth.role !== "STUDENT" && (
        <button
          onClick={() => {
            setMobileOpen(false);
            setPaletteOpen(true);
          }}
          className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-400 transition-colors hover:border-slate-300 hover:bg-white"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">Quick search...</span>
          <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400">⌘K</kbd>
        </button>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to.split("/").length <= 2}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  isActive ? "bg-gradient-to-r from-brand-50 to-brand-50/30 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />}
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                  <span className="truncate">{tab.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar name={displayName} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{displayName}</div>
            <Badge tone={roleTone}>{auth.role}</Badge>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-slate-100/70">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white shadow-[1px_0_0_0_rgba(15,23,42,0.02)] lg:flex">
        <div className="h-0.5 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600" />
        {sidebarContent}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="border-b border-slate-200 bg-white lg:hidden">
        <div className="h-0.5 bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600" />
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
              <img src="/bms-logo.svg" alt="BMSCE" className="h-8 w-8" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Proctor Diary</span>
          </div>
          <div className="flex items-center gap-1">
            {auth.role !== "STUDENT" && (
              <button onClick={() => setPaletteOpen(true)} aria-label="Quick search" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <Search className="h-5 w-5" />
              </button>
            )}
            {auth.role !== "STUDENT" && <NotificationBell />}
            <button onClick={() => setMobileOpen(true)} aria-label="Open navigation menu" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in-fast absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-200 bg-white">
            <button onClick={() => setMobileOpen(false)} aria-label="Close navigation menu" className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="relative lg:pl-64">
        {/* App-wide watermark — present behind every page, not just the
            dashboards, so the crest reads as this app's identity rather than
            a one-off homepage flourish. Fixed to the viewport (not the
            scrolling content) and far enough back (very low opacity, behind
            z-0 content) that it never competes with anything on top of it. */}
        <img
          src="/bms-logo.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none fixed bottom-[-6vw] right-[-6vw] z-0 h-[45vw] w-[45vw] max-h-[560px] max-w-[560px] opacity-[0.035] lg:right-[-4vw]"
        />
        {auth.role !== "STUDENT" && (
          <div className="sticky top-0 z-20 hidden justify-between border-b border-slate-200/70 bg-white/70 px-4 py-2.5 backdrop-blur sm:px-6 lg:flex lg:px-8">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex w-72 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-400 transition-colors hover:border-slate-300 hover:bg-white"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1">Search students, faculty, pages...</span>
              <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-slate-400">⌘K</kbd>
            </button>
            <NotificationBell />
          </div>
        )}
        <div className="animate-in relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {auth.role !== "STUDENT" && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} tabs={tabs} role={auth.role} />}
    </div>
  );
}
