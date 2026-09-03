import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Avatar, Badge } from "../components/ui";
import { NotificationBell } from "../components/NotificationBell";

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

export default function PortalLayout({ tabs, portalName }: { tabs: Tab[]; portalName: string }) {
  const { auth, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!auth) return null;

  const displayName = auth.profile.name;
  const roleTone = auth.role === "ADMIN" ? "blue" : auth.role === "PROCTOR" ? "amber" : "green";

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-soft ring-1 ring-slate-200/80">
          <img src="/bms-logo.svg" alt="BMSCE" className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight text-slate-900">Proctor Diary</div>
          <div className="truncate text-xs text-slate-400">{portalName}</div>
        </div>
      </div>

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
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200/80">
              <img src="/bms-logo.svg" alt="BMSCE" className="h-5 w-5" />
            </div>
            <span className="text-sm font-semibold text-slate-900">Proctor Diary</span>
          </div>
          <div className="flex items-center gap-1">
            {auth.role !== "STUDENT" && <NotificationBell />}
            <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in-fast absolute inset-y-0 left-0 flex w-72 flex-col border-r border-slate-200 bg-white">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="lg:pl-64">
        {auth.role !== "STUDENT" && (
          <div className="sticky top-0 z-20 hidden justify-end border-b border-slate-200/70 bg-white/70 px-4 py-2.5 backdrop-blur sm:px-6 lg:flex lg:px-8">
            <NotificationBell />
          </div>
        )}
        <div className="animate-in mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
