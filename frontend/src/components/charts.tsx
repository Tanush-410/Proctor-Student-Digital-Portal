/** Chart primitives — same external API as before (BarChart/LineChart take
 * {bars|points, max, height, ...}), now rendered with recharts internally
 * for real animated entrances, hover tooltips, and gradient fills instead of
 * static hand-rolled SVG. ProgressRing stays custom SVG — recharts has no
 * clean primitive for a labelled radial ring at this size. */
import { useId } from "react";
import {
  Area,
  AreaChart as RAreaChart,
  Bar,
  BarChart as RBarChart,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BarDatum {
  label: string;
  value: number;
  color?: string;
}

const AXIS_TICK = { fill: "#94a3b8", fontSize: 10.5 };

function ChartTooltip({ active, payload, valueSuffix = "" }: { active?: boolean; payload?: { value: number; payload: { label: string } }[]; valueSuffix?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-popover">
      <div className="font-medium text-slate-700">{p.payload.label}</div>
      <div className="font-semibold text-brand-700">
        {p.value}
        {valueSuffix}
      </div>
    </div>
  );
}

export function BarChart({ bars, max, height = 160, valueSuffix = "" }: { bars: BarDatum[]; max?: number; height?: number; valueSuffix?: string }) {
  const m = max ?? Math.max(1, ...bars.map((b) => b.value));
  const gradId = useId();
  if (bars.length === 0) return null;
  return (
    <div style={{ height }} className="-ml-1 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={bars} margin={{ top: 18, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2c7cc4" />
              <stop offset="100%" stopColor="#00519c" />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} interval={0} />
          <YAxis domain={[0, m]} hide />
          <Tooltip cursor={{ fill: "rgba(0,81,156,0.05)" }} content={<ChartTooltip valueSuffix={valueSuffix} />} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40} animationDuration={650} animationEasing="ease-out">
            <LabelList
              dataKey="value"
              position="top"
              offset={8}
              fill="#334155"
              fontSize={11}
              fontWeight={600}
              formatter={(v: unknown) => `${v}${valueSuffix}`}
            />
            {bars.map((b, i) => (
              <Cell key={i} fill={b.color ?? `url(#${gradId})`} />
            ))}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Point {
  label: string;
  value: number;
}

export function LineChart({ points, max, height = 160, color = "#00519c", refValue }: { points: Point[]; max?: number; height?: number; color?: string; refValue?: number }) {
  if (points.length === 0) return null;
  const m = max ?? Math.max(1, ...points.map((p) => p.value));
  const gradId = useId();
  return (
    <div style={{ height }} className="-ml-1 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={points} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis domain={[0, m]} hide />
          {typeof refValue === "number" && (
            <ReferenceLine y={refValue} stroke="#dc2626" strokeDasharray="3 3" strokeWidth={1} />
          )}
          <Tooltip cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }} content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.25}
            fill={`url(#${gradId})`}
            dot={{ r: 3.5, fill: color, strokeWidth: 2, stroke: "#fff" }}
            activeDot={{ r: 5 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProgressRing({ value, max, size = 88, color = "#00519c", label }: { value: number; max: number; size?: number; color?: string; label?: string }) {
  const frac = max === 0 ? 0 : Math.min(1, value / max);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const gradId = useId();
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2c7cc4" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="8"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          strokeLinecap="round"
          className="transition-all duration-700 ease-premium"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-lg font-semibold text-slate-900">{Math.round(frac * 100)}%</span>
        {label && <span className="text-[10px] text-slate-400">{label}</span>}
      </div>
    </div>
  );
}
