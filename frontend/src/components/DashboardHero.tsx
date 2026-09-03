import { ReactNode } from "react";

/**
 * Premium gradient banner for each portal's home page — same visual language
 * as the login screen's brand panel (dot grid + glow blobs), so the crest
 * carries through from sign-in to the first thing every role sees, not just
 * a one-off login flourish. The crest itself sits large and near-transparent
 * as a watermark, not a literal decal, so it doesn't compete with the text.
 */
export function DashboardHero({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-900 px-6 py-7 shadow-card sm:px-8 sm:py-9">
      <div className="pointer-events-none absolute inset-0 bg-[length:28px_28px] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] opacity-[0.12]" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-400/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-brand-900/40 blur-3xl" />
      <img
        src="/bms-logo.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-6 h-52 w-52 opacity-[0.09] sm:h-64 sm:w-64"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <div className="mb-2.5 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
              {eyebrow}
            </div>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-brand-100">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
