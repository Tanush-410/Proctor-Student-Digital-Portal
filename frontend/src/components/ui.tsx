import { ButtonHTMLAttributes, HTMLAttributes, ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ArrowUpDown, LucideIcon, Rows3, Rows4 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

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

export function EmptyState({
  message,
  hint,
  icon: Icon,
  action,
}: {
  message: string;
  hint?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center gap-3 overflow-hidden px-5 py-14 text-center">
      {/* Faint BMS crest behind the icon — ties every empty state back to the
          same brand mark used on the watermark/hero rather than a plain
          generic icon-in-a-box, at near-zero cost since it's one shared
          component feeding all ~18 empty states in the app. */}
      <img
        src="/bms-logo.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
      />
      {Icon && (
        <div className="relative mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 text-slate-400 ring-1 ring-slate-200/60">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div className="relative space-y-1">
        <p className="text-sm font-medium text-slate-600">{message}</p>
        {hint && <p className="mx-auto max-w-xs text-xs text-slate-400">{hint}</p>}
      </div>
      {action && <div className="relative mt-1">{action}</div>}
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
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  );
}

/** A row shaped like the avatar+name+meta+badge rows this app's tables and
 * card lists actually use, so a loading list reads as "this specific list is
 * loading" rather than a handful of generic bars. */
export function SkeletonAvatarRows({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-3.5">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
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

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-slate-600">
      {children}
    </label>
  );
}

/**
 * A button with no visible text — every one of these MUST get a real
 * `label` (rendered as aria-label + title), since an icon alone tells a
 * screen reader nothing. Carries the same focus ring / hover treatment as
 * every other interactive control in the app.
 */
export function IconButton({
  icon: Icon,
  label,
  tone = "default",
  size = "md",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: "default" | "danger";
  size?: "sm" | "md";
}) {
  const toneStyles = tone === "danger" ? "text-slate-400 hover:bg-red-50 hover:text-red-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700";
  const sizeStyles = size === "sm" ? "p-1.5" : "p-2";
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${toneStyles} ${sizeStyles} ${className}`}
      {...rest}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </button>
  );
}

const STAT_TONE: Record<string, { text: string; iconBg: string; iconText: string; accent: string }> = {
  slate: { text: "text-slate-900", iconBg: "bg-slate-100", iconText: "text-slate-500", accent: "bg-slate-300" },
  green: { text: "text-emerald-600", iconBg: "bg-emerald-50", iconText: "text-emerald-600", accent: "bg-emerald-500" },
  red: { text: "text-red-600", iconBg: "bg-red-50", iconText: "text-red-600", accent: "bg-red-500" },
  amber: { text: "text-amber-600", iconBg: "bg-amber-50", iconText: "text-amber-600", accent: "bg-amber-500" },
  blue: { text: "text-brand-600", iconBg: "bg-brand-50", iconText: "text-brand-600", accent: "bg-brand-500" },
};

const SPARK_COLOR: Record<string, string> = {
  slate: "#94a3b8",
  green: "#10b981",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#00519c",
};

export function StatTile({
  label,
  value,
  tone = "slate",
  icon: Icon,
  loading,
  index,
  trend,
}: {
  label: string;
  value: ReactNode;
  tone?: "slate" | "green" | "red" | "amber" | "blue";
  icon?: LucideIcon;
  loading?: boolean;
  /** Position within a stat-tile grid — when set, the tile fades/slides in with a
   * per-index delay so a row of tiles arrives as a soft cascade rather than all at
   * once. Omit for a tile shown alone (e.g. a lone CGPA stat), where a stagger has
   * nothing to stagger against. */
  index?: number;
  /** Optional series (e.g. SGPA per semester) rendered as a tiny sparkline
   * under the value — only worth passing when there's a real trend behind
   * the number; a single-point or absent trend renders nothing. */
  trend?: number[];
}) {
  const t = STAT_TONE[tone];
  const showTrend = trend && trend.length > 1;
  return (
    <motion.div
      initial={index !== undefined ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: (index ?? 0) * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="group relative overflow-hidden px-5 py-4 transition-all duration-200 ease-premium hover:-translate-y-0.5 hover:shadow-popover">
        <div className={`absolute inset-x-0 top-0 h-0.5 ${t.accent} opacity-0 transition-opacity duration-200 group-hover:opacity-100`} />
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-16" />
            ) : (
              <div className={`mt-1 text-2xl font-semibold tracking-tight ${t.text}`}>{value}</div>
            )}
          </div>
          {Icon && !showTrend && (
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.iconBg} ${t.iconText}`}>
              <Icon className="h-4 w-4" />
            </div>
          )}
          {showTrend && (
            <div className="h-9 w-16 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend.map((v) => ({ v }))} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SPARK_COLOR[tone]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SPARK_COLOR[tone]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke={SPARK_COLOR[tone]} strokeWidth={1.75} fill={`url(#spark-${label})`} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
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

/**
 * Renders `table` as a real <table> on md+ screens and as a stacked list of
 * cards below that — a wide multi-column table has no good way to shrink
 * that isn't either a horizontal-scroll strip (works, but is genuinely bad
 * on a phone) or a restructured layout, so this owns the breakpoint switch
 * once instead of every page duplicating a `hidden md:block` / `md:hidden`
 * pair. `table` is the full desktop `<table>…</table>` element; `cards` is
 * the same rows re-rendered as `<MobileListRow>` children.
 */
export function ResponsiveTable({ table, cards }: { table: ReactNode; cards: ReactNode }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">{table}</div>
      <ul className="divide-y divide-slate-100 md:hidden">{cards}</ul>
    </>
  );
}

/** A pill-style tab strip for picking one semester out of a student's
 * academic record, so a multi-semester history reads as one focused panel
 * instead of a long stacked list. */
export function SemesterTabs({ semesters, active, onChange }: { semesters: number[]; active: number; onChange: (sem: number) => void }) {
  return (
    <div role="tablist" aria-label="Select semester" className="flex flex-wrap gap-1.5">
      {semesters.map((sem) => (
        <button
          key={sem}
          type="button"
          role="tab"
          aria-selected={sem === active}
          onClick={() => onChange(sem)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            sem === active ? "bg-brand-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Semester {sem}
        </button>
      ))}
    </div>
  );
}

/** One row of a ResponsiveTable's mobile card list — leading visual, a title
 * + one or two meta lines, and trailing content (a badge, a value, an
 * action). Matches the row shape already used by Directory's search results. */
export function MobileListRow({ to, leading, title, meta, trailing }: { to?: string; leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">{title}</div>
        {meta && <div className="mt-0.5 truncate text-xs text-slate-400">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
  return <li>{to ? <Link to={to} className="block transition-colors hover:bg-slate-50">{content}</Link> : content}</li>;
}

/** Mobile card for a ResponsiveTable whose rows are aggregate stats (a
 * section/semester breakdown) rather than an entity — a title plus a small
 * grid of labelled numbers, instead of the avatar+meta shape MobileListRow
 * is for. */
export function StatRowCard({ title, stats }: { title: ReactNode; stats: { label: string; value: ReactNode }[] }) {
  return (
    <li className="px-4 py-3.5">
      <div className="mb-2 text-sm font-semibold text-slate-800">{title}</div>
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s, i) => (
          <div key={i}>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className="text-sm font-medium text-slate-700">{s.value}</div>
          </div>
        ))}
      </div>
    </li>
  );
}

export type SortDir = "asc" | "desc";

/** Client-side sort for a table's rows by an arbitrary string/number key,
 * shared by every table big enough to benefit from sorting (rebuilding this
 * per-page would mean duplicating the same comparator logic in each one). */
export function useSort<T>(rows: T[], accessor: (row: T, key: string) => string | number, initialKey?: string) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialKey);
  const [dir, setDir] = useState<SortDir>("desc");

  function toggle(key: string) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = accessor(a, sortKey);
      const bv = accessor(b, sortKey);
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, dir, accessor]);

  return { sorted, sortKey, dir, toggle };
}

/** A <th> that's clickable to sort by `sortKey`, with an arrow showing
 * current direction once active and a neutral hint icon otherwise. */
export function SortableTh({
  children,
  sortKey,
  activeKey,
  dir,
  onSort,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  sortKey: string;
  activeKey?: string;
  dir: SortDir;
  onSort: (key: string) => void;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const active = sortKey === activeKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const alignClass = align === "right" ? "justify-end text-right" : align === "center" ? "justify-center text-center" : "justify-start text-left";
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full items-center gap-1 select-none whitespace-nowrap transition-colors hover:text-slate-700 ${alignClass} ${active ? "text-slate-700" : ""}`}
      >
        {children}
        <Icon className={`h-3 w-3 shrink-0 ${active ? "text-brand-600" : "text-slate-300"}`} />
      </button>
    </th>
  );
}

export type Density = "comfortable" | "compact";

/** Row vertical padding for the two density levels, shared so every table
 * using the toggle looks consistent rather than each page picking its own
 * compact spacing. */
export const DENSITY_PAD: Record<Density, string> = { comfortable: "py-2.5", compact: "py-1.5" };

export function DensityToggle({ density, onChange }: { density: Density; onChange: (d: Density) => void }) {
  return (
    <div role="radiogroup" aria-label="Row density" className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
      {(["comfortable", "compact"] as Density[]).map((d) => (
        <button
          key={d}
          role="radio"
          aria-checked={density === d}
          onClick={() => onChange(d)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium capitalize transition-colors ${
            density === d ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          {d === "compact" ? <Rows4 className="h-3.5 w-3.5" /> : <Rows3 className="h-3.5 w-3.5" />}
          {d}
        </button>
      ))}
    </div>
  );
}

/** Bounds a table to `maxHeight` with its own scrollbar and a header that
 * stays pinned while the body scrolls — for the handful of tables long
 * enough (dozens+ of rows) that losing the header on scroll actually hurts.
 * The <thead> passed in must have an opaque background (not the usual
 * translucent bg-slate-50/70) or rows will show through it while stuck. */
export function StickyScrollTable({ children, maxHeight = "32rem" }: { children: ReactNode; maxHeight?: string }) {
  return (
    <div className="overflow-auto rounded-b-2xl" style={{ maxHeight }}>
      {children}
    </div>
  );
}

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="mb-1 flex items-center gap-1.5 text-sm text-slate-400">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-slate-300">/</span>}
          {item.to ? (
            <Link to={item.to} className="text-slate-500 transition-colors hover:text-brand-600">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-700">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
