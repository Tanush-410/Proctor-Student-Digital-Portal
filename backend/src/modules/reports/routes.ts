import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { computeCGPA, computeSGPA, getBacklogSubjects, resolvePrecedence } from "../results/engine";
import { buildParentSummaryPdf } from "./pdf";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { logAudit } from "../../lib/audit";

export const reportsRouter = safeRouter();

// GET /students/:usn/report — generate Parent Summary Report (PDF).
reportsRouter.get("/students/:usn/report", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn }, include: { proctor: true } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const records = await prisma.resultRecord.findMany({ where: { usn: student.usn } });
  const effective = resolvePrecedence(records);
  const semesters = [...new Set(effective.map((r) => r.semester))];
  const sgpaBySemester = Object.fromEntries(semesters.map((s) => [s, computeSGPA(effective, s)]));
  const cgpa = computeCGPA(effective);

  const approvedClaims = await prisma.activityPointClaim.findMany({ where: { usn: student.usn, status: "APPROVED" } });
  const activityPointsTotal = approvedClaims.reduce((sum, c) => sum + (c.grantedPoints ?? 0), 0);

  const recentNotes = await prisma.studentNote.findMany({
    where: { usn: student.usn },
    orderBy: { createdAt: "desc" },
    take: 3,
    include: { author: { select: { name: true, shortCode: true } } },
  });

  // Rank among the same proctor's other proctees, by CGPA — "how is this
  // student doing relative to who I'm actually responsible for", which is
  // what a proctor/parent meeting about this report actually wants to know.
  // Unassigned students (no proctor) get no rank rather than a misleading one.
  let rank: { position: number; of: number } | null = null;
  if (student.proctorId && cgpa !== null) {
    const cohort = await prisma.student.findMany({ where: { proctorId: student.proctorId }, select: { usn: true } });
    const cohortResults = await prisma.resultRecord.findMany({ where: { usn: { in: cohort.map((c) => c.usn) } } });
    const byUsn = new Map<string, typeof cohortResults>();
    for (const r of cohortResults) byUsn.set(r.usn, [...(byUsn.get(r.usn) ?? []), r]);
    const cgpas = cohort
      .map((c) => computeCGPA(resolvePrecedence(byUsn.get(c.usn) ?? [])))
      .filter((g): g is number => g !== null)
      .sort((a, b) => b - a);
    const position = cgpas.findIndex((g) => g <= cgpa) + 1;
    rank = { position: position || cgpas.length, of: cgpas.length };
  }

  // Section/semester-cohort CGPA averages, for the "Cohort Comparison" chart —
  // same effective-results engine as everywhere else, just scoped to peers
  // sharing this student's section / current semester instead of their proctor.
  async function avgCgpaOf(where: { section?: string; currentSemester: number }): Promise<number | null> {
    const peers = await prisma.student.findMany({ where, select: { usn: true } });
    const peerResults = await prisma.resultRecord.findMany({ where: { usn: { in: peers.map((p) => p.usn) } } });
    const byUsn = new Map<string, typeof peerResults>();
    for (const r of peerResults) byUsn.set(r.usn, [...(byUsn.get(r.usn) ?? []), r]);
    const cgpas = peers.map((p) => computeCGPA(resolvePrecedence(byUsn.get(p.usn) ?? []))).filter((g): g is number => g !== null);
    return cgpas.length ? Math.round((cgpas.reduce((a, b) => a + b, 0) / cgpas.length) * 100) / 100 : null;
  }
  const comparison = {
    section: student.section ? { label: student.section, avgCgpa: await avgCgpaOf({ section: student.section, currentSemester: student.currentSemester }) } : null,
    semester: { label: `Sem ${student.currentSemester} Avg`, avgCgpa: await avgCgpaOf({ currentSemester: student.currentSemester }) },
  };

  logAudit(req, "EXPORT", "ParentSummaryReport", student.usn);
  buildParentSummaryPdf(
    {
      student,
      effective,
      sgpaBySemester,
      cgpa,
      backlogSubjects: getBacklogSubjects(effective).map((r) => ({ subjectCode: r.subjectCode, semester: r.semester })),
      activityPointsTotal,
      recentNotes: recentNotes.map((n) => ({ note: n.note, author: `${n.author.name} (${n.author.shortCode})`, createdAt: n.createdAt })),
      rank,
      comparison,
    },
    res
  );
});
