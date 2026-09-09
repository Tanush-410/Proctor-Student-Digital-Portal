import { ReactNode } from "react";
import { Badge } from "../../components/ui";

export interface ResultTableRow {
  subjectCode: string;
  effective: {
    subjectName: string | null;
    internalMarks: number | null;
    externalMarks: number | null;
    totalMarks: number | null;
    credits: number;
    grade: string | null;
    status: string;
    sourceType: string;
  };
  gradePoint: number;
  discrepancy: boolean;
}

const SOURCE_SUFFIX: Record<string, string> = {
  TAL: "TAL",
  REVAL: "Reval",
  CHALLENGE_REVAL: "Challenge Reval",
  SUPPLEMENTARY: "Suppl.",
  STUDENT_PROVISIONAL: "Provisional",
};

/** Renders a semester's results in the official BMSCE result-portal layout:
 * a bordered marks grid (CIE/SEE/Total/Credits/Grade Point/Grade) with a
 * bold SGPA pill up top, and non-MAIN records (Reval/TAL/Supplementary)
 * amber-highlighted with a suffix — matching the reference screenshot. */
export function ResultTable({ sgpa, rows }: { sgpa: number | null; rows: ResultTableRow[] }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="text-base font-semibold text-slate-800">Result</h3>
        <span className="rounded-full bg-brand-700 px-4 py-1 text-sm font-bold text-white shadow-sm">SGPA: {sgpa ?? "N/A"}</span>
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <Th>Course Code</Th>
              <Th>Course Name</Th>
              <Th align="right">CIE</Th>
              <Th align="right">SEE</Th>
              <Th align="right">Total</Th>
              <Th align="right">Credits</Th>
              <Th align="right">Grade Point</Th>
              <Th align="center">Grade</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const suffix = SOURCE_SUFFIX[r.effective.sourceType];
              const failed = r.effective.status !== "PASS";
              return (
                <tr key={r.subjectCode} className={`border-t border-slate-200 ${suffix ? "bg-amber-50" : ""}`}>
                  <Td>
                    {r.subjectCode}
                    {suffix && <span className="text-slate-500"> ({suffix})</span>}
                  </Td>
                  <Td>
                    {r.effective.subjectName ?? "-"}
                    {r.discrepancy && (
                      <span className="ml-2">
                        <Badge tone="amber">recheck</Badge>
                      </span>
                    )}
                  </Td>
                  <Td align="right">{r.effective.internalMarks ?? "-"}</Td>
                  <Td align="right">{r.effective.externalMarks ?? "-"}</Td>
                  <Td align="right" className="font-semibold text-slate-800">
                    {r.effective.totalMarks ?? "-"}
                  </Td>
                  <Td align="right">{r.effective.credits}</Td>
                  <Td align="right">{r.gradePoint}</Td>
                  <Td align="center" className={`font-semibold ${failed ? "text-red-600" : "text-slate-800"}`}>
                    {r.effective.grade ?? "-"}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 md:hidden">
        {rows.map((r) => {
          const suffix = SOURCE_SUFFIX[r.effective.sourceType];
          const failed = r.effective.status !== "PASS";
          return (
            <li key={r.subjectCode} className={`px-4 py-3 ${suffix ? "bg-amber-50" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">
                    {r.subjectCode}
                    {suffix && <span className="text-slate-500"> ({suffix})</span>}
                  </div>
                  {r.effective.subjectName && <div className="text-xs text-slate-400">{r.effective.subjectName}</div>}
                </div>
                <span className={`shrink-0 text-base font-bold ${failed ? "text-red-600" : "text-slate-800"}`}>{r.effective.grade ?? "-"}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>CIE {r.effective.internalMarks ?? "-"}</span>
                <span>SEE {r.effective.externalMarks ?? "-"}</span>
                <span>Total {r.effective.totalMarks ?? "-"}</span>
                <span>{r.effective.credits} cr</span>
                <span>GP {r.gradePoint}</span>
                {r.discrepancy && <Badge tone="amber">recheck</Badge>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const ALIGN: Record<"left" | "right" | "center", string> = { left: "text-left", right: "text-right", center: "text-center" };

function Th({ children, align = "left" }: { children: ReactNode; align?: "left" | "right" | "center" }) {
  return <th className={`border-b border-slate-200 px-4 py-2.5 ${ALIGN[align]}`}>{children}</th>;
}

function Td({ children, align = "left", className = "" }: { children: ReactNode; align?: "left" | "right" | "center"; className?: string }) {
  return <td className={`px-4 py-2.5 text-slate-600 ${ALIGN[align]} ${className}`}>{children}</td>;
}
