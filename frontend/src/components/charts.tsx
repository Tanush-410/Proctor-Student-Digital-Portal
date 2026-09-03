/** Lightweight, dependency-free SVG chart primitives — no charting library
 * needed for the handful of bar/line panels this app shows. */

interface Bar {
  label: string;
  value: number;
  color?: string;
}

export function BarChart({ bars, max, height = 160, valueSuffix = "" }: { bars: Bar[]; max?: number; height?: number; valueSuffix?: string }) {
  const m = max ?? Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {bars.map((b, i) => {
        const h = m === 0 ? 0 : Math.max(2, (b.value / m) * (height - 34));
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-600">
              {b.value}
              {valueSuffix}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height: height - 34 }}>
              <div
                className="w-full max-w-[34px] rounded-t-md transition-all duration-500 ease-premium"
                style={{ height: h, backgroundColor: b.color ?? "#00519c" }}
              />
            </div>
            <span className="max-w-full truncate text-[10px] text-slate-400" title={b.label}>
              {b.label}
            </span>
          </div>
        );
      })}
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
  const w = 100;
  const padY = 12;
  const usableH = height - padY * 2;
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length === 1 ? w / 2 : i * step,
    y: padY + usableH - (Math.min(p.value, m) / m) * usableH,
    p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const refY = refValue !== undefined ? padY + usableH - (Math.min(refValue, m) / m) * usableH : null;

  return (
    <div style={{ height }} className="relative w-full">
      <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
        {refY !== null && <line x1="0" y1={refY} x2={w} y2={refY} stroke="#cbd5e1" strokeWidth="0.6" strokeDasharray="2,2" />}
        {coords.length > 1 && <path d={path} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r="1.8" fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-1 flex justify-between px-0.5">
        {points.map((p, i) => (
          <span key={i} className="text-[10px] text-slate-400">
            {p.label}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-0.5" style={{ height: usableH + padY }}>
        {coords.map((c, i) => (
          <span key={i} className="relative text-[10px] font-medium text-slate-600" style={{ position: "absolute", left: `${(c.x / w) * 100}%`, top: c.y - 16, transform: "translateX(-50%)" }}>
            {c.p.value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ProgressRing({ value, max, size = 88, color = "#00519c", label }: { value: number; max: number; size?: number; color?: string; label?: string }) {
  const frac = max === 0 ? 0 : Math.min(1, value / max);
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
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
