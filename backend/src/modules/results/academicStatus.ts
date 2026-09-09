import { EffectiveResult } from "./engine";

export type StatusAction =
  | { code: "F"; label: "Failed"; detail: string }
  | { code: "NE"; label: "Not Eligible"; detail: string }
  | { code: "X"; label: "Borderline (make-up eligible)"; detail: string }
  | { code: "W"; label: "Withdrawn"; detail: string }
  | { code: "I"; label: "Incomplete (make-up eligible)"; detail: string }
  | { code: "DX"; label: "Detained"; detail: string };

export interface SubjectFlag {
  subjectCode: string;
  subjectName: string | null;
  semester: number;
  grade: string;
  action: StatusAction;
}

export interface AcademicStatus {
  backlogs: SubjectFlag[];
  transitional: SubjectFlag[];
  cgpaWarning: string | null;
  seventhSemesterEligible: boolean | null;
  seventhSemesterBlockers: string[];
}

/** Per BMSCE's Academic Rules & Regulations (Section 8.2.4 for transitional
 * grades, Section 7.5.8 for NE, Section 9.3.a for successive-failure limits).
 * A course marked "F"/"NE"/"W" carries no credit until cleared; "X"/"I" are
 * resolved by a make-up exam rather than a full re-registration. */
const ACTIONS: Record<string, (subj: string) => StatusAction> = {
  F: (s) => ({ code: "F", label: "Failed", detail: `No credit earned in ${s}. Must re-register and clear both CIE and SEE — in a later regular semester or a Supplementary/Fast-Track semester (offered after semesters 4 and 8). After four failed attempts in a non-core course, the student may swap it for an alternate elective of the same credit value.` }),
  NE: (s) => ({ code: "NE", label: "Not Eligible", detail: `Attendance and/or CIE requirement not met in ${s}, so the student was not eligible to sit the SEE. Must re-register for the course and earn the required CIE/attendance again before being eligible for SEE.` }),
  X: (s) => ({ code: "X", label: "Borderline (make-up eligible)", detail: `CIE ≥90% and attendance satisfied in ${s}, but SEE performance was poor. No F is recorded — the student gets a make-up exam. If not cleared there, the grade is downgraded to the next lower passing grade.` }),
  W: (s) => ({ code: "W", label: "Withdrawn", detail: `Withdrawn from ${s} before the prescribed date under faculty advice. Must re-register and retake the course; the W becomes a real letter grade only after that.` }),
  I: (s) => ({ code: "I", label: "Incomplete (make-up eligible)", detail: `Absent from the SEE of ${s} for a College-approved reason (medical emergency, family calamity, etc.) despite satisfactory attendance/CIE. Eligible for a make-up exam; the grade earned there is final.` }),
  DX: (s) => ({ code: "DX", label: "Detained", detail: `Marked DX in ${s} — typically a "Not Eligible"/detained outcome on a specific component (e.g. no SEE attempt recorded). Treat the same as a backlog: the course must be re-registered and cleared.` }),
};

/** Computes what a student needs to do next, purely from their own result
 * records — no fabricated data, just BMSCE's published rules applied to
 * whatever grades/CGPA are on file. */
export function computeAcademicStatus(effectiveResults: EffectiveResult[], cgpa: number | null, currentSemester: number): AcademicStatus {
  const backlogs: SubjectFlag[] = [];
  const transitional: SubjectFlag[] = [];

  for (const r of effectiveResults) {
    const grade = (r.effective.grade ?? "").toUpperCase();
    const build = ACTIONS[grade];
    if (!build) continue;
    const flag: SubjectFlag = {
      subjectCode: r.subjectCode,
      subjectName: r.effective.subjectName,
      semester: r.semester,
      grade,
      action: build(r.effective.subjectName ?? r.subjectCode),
    };
    if (grade === "F" || grade === "NE" || grade === "W" || grade === "DX") backlogs.push(flag);
    else transitional.push(flag);
  }

  const cgpaWarning =
    cgpa !== null && cgpa < 5.0
      ? `CGPA ${cgpa.toFixed(2)} is below the College's minimum standard of 5.00 — this places the student on academic probation. Failing to reach a CGPA of 5.00 for three consecutive semesters can lead to being asked to discontinue the programme.`
      : null;

  // Section 8.3(b): eligibility for VII semester requires every Semester 1 & 2
  // course cleared — the one vertical-progression milestone that's concretely
  // checkable from result data alone (III/V-semester thresholds in the base
  // regulations were superseded by this simpler rule for BE in the current
  // amendment). Only meaningful once the student has actually reached that
  // point in the programme; earlier semesters return null (not yet relevant).
  let seventhSemesterEligible: boolean | null = null;
  const seventhSemesterBlockers: string[] = [];
  if (currentSemester >= 5) {
    const firstYearBacklogs = backlogs.filter((b) => b.semester === 1 || b.semester === 2);
    seventhSemesterEligible = firstYearBacklogs.length === 0;
    for (const b of firstYearBacklogs) {
      seventhSemesterBlockers.push(`${b.subjectCode}${b.subjectName ? ` (${b.subjectName})` : ""} — Semester ${b.semester}, grade ${b.grade}`);
    }
  }

  return { backlogs, transitional, cgpaWarning, seventhSemesterEligible, seventhSemesterBlockers };
}
