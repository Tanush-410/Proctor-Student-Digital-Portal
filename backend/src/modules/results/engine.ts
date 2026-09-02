import { ResultRecord } from "@prisma/client";

export type SourceType = "MAIN" | "TAL" | "REVAL" | "CHALLENGE_REVAL" | "SUPPLEMENTARY" | "STUDENT_PROVISIONAL";

/**
 * Precedence order, highest first. CHALLENGE_REVAL > REVAL > TAL > MAIN is
 * given directly by the design document; SUPPLEMENTARY and STUDENT_PROVISIONAL
 * are not ranked there (Section 13: "TAL rank ... pending confirmation" is the
 * documented open question). Assumption made here: a SUPPLEMENTARY re-attempt
 * supersedes the original MAIN result for a backlog subject, and a student's
 * own provisional entry is only ever a placeholder — it never outranks any
 * official record, only the absence of one.
 */
const PRECEDENCE: string[] = [
  "CHALLENGE_REVAL",
  "REVAL",
  "TAL",
  "SUPPLEMENTARY",
  "MAIN",
  "STUDENT_PROVISIONAL",
];

function precedenceRank(sourceType: string): number {
  const idx = PRECEDENCE.indexOf(sourceType);
  return idx === -1 ? PRECEDENCE.length : idx;
}

export interface EffectiveResult {
  usn: string;
  subjectCode: string;
  semester: number;
  effective: ResultRecord;
  allRecords: ResultRecord[];
  discrepancy: boolean;
}

/** ResultsEngine.resolvePrecedence — groups by (usn, subject, semester) and
 * selects the highest-precedence record as the effective result. */
export function resolvePrecedence(records: ResultRecord[]): EffectiveResult[] {
  const groups = new Map<string, ResultRecord[]>();
  for (const r of records) {
    const key = `${r.usn}::${r.subjectCode}::${r.semester}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const results: EffectiveResult[] = [];
  for (const [key, group] of groups) {
    const [usn, subjectCode, semesterStr] = key.split("::");
    const sorted = [...group].sort((a, b) => precedenceRank(a.sourceType) - precedenceRank(b.sourceType));
    const effective = sorted[0];
    const discrepancy = detectDiscrepancy(group);
    results.push({ usn, subjectCode, semester: parseInt(semesterStr, 10), effective, allRecords: group, discrepancy });
  }
  return results;
}

/** ResultsEngine.detectDiscrepancy — true if a student self-entry disagrees
 * with the resolved official (non-provisional) record for the same subject. */
export function detectDiscrepancy(group: ResultRecord[]): boolean {
  const provisional = group.find((r) => r.sourceType === "STUDENT_PROVISIONAL");
  const official = group
    .filter((r) => r.sourceType !== "STUDENT_PROVISIONAL")
    .sort((a, b) => precedenceRank(a.sourceType) - precedenceRank(b.sourceType))[0];
  if (!provisional || !official) return false;
  return provisional.grade !== official.grade || provisional.totalMarks !== official.totalMarks;
}

const GRADE_POINTS: Record<string, number> = {
  O: 10,
  "A+": 9,
  A: 8,
  "B+": 7,
  B: 6,
  C: 5,
  P: 4,
  F: 0,
  AB: 0,
};

export function gradeToPoint(grade: string | null | undefined): number {
  if (!grade) return 0;
  return GRADE_POINTS[grade.toUpperCase()] ?? 0;
}

/** ResultsEngine.computeSGPA — credit-weighted average grade point for one semester's effective results. */
export function computeSGPA(effectiveResults: EffectiveResult[], semester: number): number | null {
  const inSem = effectiveResults.filter((r) => r.semester === semester);
  const totalCredits = inSem.reduce((sum, r) => sum + (r.effective.credits || 0), 0);
  if (totalCredits === 0) return null;
  const weighted = inSem.reduce((sum, r) => sum + gradeToPoint(r.effective.grade) * (r.effective.credits || 0), 0);
  return Math.round((weighted / totalCredits) * 100) / 100;
}

/** ResultsEngine.computeCGPA — credit-weighted average grade point across all semesters' effective results. */
export function computeCGPA(effectiveResults: EffectiveResult[]): number | null {
  const totalCredits = effectiveResults.reduce((sum, r) => sum + (r.effective.credits || 0), 0);
  if (totalCredits === 0) return null;
  const weighted = effectiveResults.reduce((sum, r) => sum + gradeToPoint(r.effective.grade) * (r.effective.credits || 0), 0);
  return Math.round((weighted / totalCredits) * 100) / 100;
}

export function getBacklogSubjects(effectiveResults: EffectiveResult[]): EffectiveResult[] {
  return effectiveResults.filter((r) => r.effective.status === "FAIL" || r.effective.status === "WITHHELD" || r.effective.status === "ABSENT");
}
