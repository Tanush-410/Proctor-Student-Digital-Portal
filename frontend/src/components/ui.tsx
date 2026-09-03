import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { LucideIcon } from "lucide-react";

export function Card({ children, className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  icon?: LucideIcon;
}) {
  const styles: Record<string, string> = {
    primary:
      "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-xs hover:from-brand-600 hover:to-brand-700 active:from-brand-700 active:to-brand-800 disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none",
    secondary: "bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 hover:border-slate-300 active:bg-slate-100 disabled:text-slate-400",
    danger: "bg-gradient-to-b from-red-500 to-red-600 text-white shadow-xs hover:from-red-600 hover:to-red-700 active:from-red-700 active:to-red-800 disabled:from-slate-300 disabled:to-slate-300",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1.5 text-xs gap-1",
    md: "px-3.5 py-2 text-sm gap-1.5",
  };
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 ease-premium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed active:scale-[0.98] ${styles[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {Icon && <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
}

export function Badge({ tone = "slate", icon: Icon, children }: { tone?: "slate" | "green" | "red" | "amber" | "blue"; icon?: LucideIcon; children: ReactNode }) {
  const styles: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 ring-slate-600/10",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    red: "bg-red-50 text-red-700 ring-red-600/20",
    amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
    blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[tone]}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function EmptyState({ message, icon: Icon }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
      {Icon && (
        <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <div className={`h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600 ${className}`} />;
}

export function PageSpinner() {
  return (
    <div className="flex justify-center py-20">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 ${props.className ?? ""}`}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-shadow placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs transition-shadow focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 ${props.className ?? ""}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-slate-600">{children}</label>;
}

const STAT_TONE: Record<string, { text: string; iconBg: string; iconText: string; accent: string }> = {
  slate: { text: "text-slate-900", iconBg: "bg-slate-100", iconText: "text-slate-500", accent: "bg-slate-300" },
  green: { text: "text-emerald-600", iconBg: "bg-emerald-50", iconText: "text-emerald-600", accent: "bg-emerald-500" },
  red: { text: "text-red-600", iconBg: "bg-red-50", iconText: "text-red-600", accent: "bg-red-500" },
  amber: { text: "text-amber-600", iconBg: "bg-amber-50", iconText: "text-amber-600", accent: "bg-amber-500" },
  blue: { text: "text-brand-600", iconBg: "bg-brand-50", iconText: "text-brand-600", accent: "bg-brand-500" },
};

export function StatTile({
  label,
  value,
  tone = "slate",
  icon: Icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
  icon?: LucideIcon;
  loading?: boolean;
}) {
  const t = STAT_TONE[tone];
  return (
    <Card className="group relative overflow-hidden px-5 py-4 transition-all duration-200 ease-premium hover:-translate-y-0.5 hover:shadow-popover">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${t.accent} opacity-0 transition-opacity duration-200 group-hover:opacity-100`} />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className={`mt-1 text-2xl font-semibold tracking-tight ${t.text}`}>{value}</div>
          )}
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

const AVATAR_PALETTE = ["bg-brand-100 text-brand-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700"];

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const palette = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  const sizes = { sm: "h-7 w-7 text-[11px]", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" };
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${palette} ${sizes[size]}`}>
      {initials || "?"}
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-slate-100 ${className}`} />;
}
