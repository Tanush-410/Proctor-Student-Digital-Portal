import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { computeCGPA, computeSGPA, getBacklogSubjects, resolvePrecedence } from "../results/engine";
import { buildParentSummaryPdf } from "./pdf";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const reportsRouter = safeRouter();

// GET /students/:usn/report — generate Parent Summary Report (PDF).
reportsRouter.get("/students/:usn/report", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn }, include: { proctor: true } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const records = await prisma.resultRecord.findMany({ where: { usn: student.usn } });
  const effective = resolvePrecedence(records);
  const semesters = [...new Set(effective.map((r) => r.semester))];
  const sgpaBySemester = Object.fromEntries(semesters.map((s) => [s, computeSGPA(effective, s)]));

  const approvedClaims = await prisma.activityPointClaim.findMany({ where: { usn: student.usn, status: "APPROVED" } });
  const activityPointsTotal = approvedClaims.reduce((sum, c) => sum + (c.grantedPoints ?? 0), 0);

  buildParentSummaryPdf(
    {
      student,
      effective,
      sgpaBySemester,
      cgpa: computeCGPA(effective),
      backlogSubjects: getBacklogSubjects(effective).map((r) => ({ subjectCode: r.subjectCode, semester: r.semester })),
      activityPointsTotal,
    },
    res
  );
});
