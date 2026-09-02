import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const studentsRouter = safeRouter();

function canView(auth: NonNullable<AuthedRequest["auth"]>, student: { proctorId: number | null; usn: string }): boolean {
  if (auth.role === "ADMIN") return true;
  if (auth.role === "PROCTOR") return true; // matrix: proctor can Read even another proctor's proctee
  if (auth.role === "STUDENT") return auth.usn === student.usn;
  return false;
}

// GET /students — list/search (Admin, Proctor only). Proctor sees own proctees by default.
// ?limit=&offset= cap an unscoped call (e.g. Admin browsing everyone) at a sane
// page size instead of shipping every row — a proctor's own list (?mine=true)
// is naturally small (tens of students) so the default limit never engages for it.
studentsRouter.get("/", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const mineOnly = req.query.mine === "true";
  const where: any = {};
  if (mineOnly && req.auth!.role === "PROCTOR") where.proctorId = req.auth!.facultyId;
  if (q) where.OR = [{ name: { contains: q } }, { usn: { contains: q } }];

  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const students = await prisma.student.findMany({ where, orderBy: { usn: "asc" }, take: limit, skip: offset });
  res.json(students);
});

// GET /students/count — total count for the Admin dashboard stat tile, without
// shipping all 3000 student rows over the wire just to read .length client-side.
studentsRouter.get("/count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (_req: AuthedRequest, res) => {
  const count = await prisma.student.count();
  res.json({ count });
});

// GET /students/:usn — full student detail view.
studentsRouter.get("/:usn", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({
    where: { usn: req.params.usn },
    include: { proctor: { select: { facultyId: true, name: true, shortCode: true, email: true, cabinNo: true, phone: true } } },
  });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!canView(req.auth!, student)) return res.status(403).json({ error: "Not authorized to view this student" });
  res.json(student);
});

const residenceSchema = z.object({
  localAddress: z.string().optional(),
  localGuardianName: z.string().optional(),
  localGuardianPhone: z.string().optional(),
});

// PATCH /students/:usn — Student.updateResidenceInfo(): self-service edit of
// residence and local-guardian fields only; every other field is server-owned.
studentsRouter.patch("/:usn", requireAuth, requireRole("STUDENT"), async (req: AuthedRequest, res) => {
  if (req.auth!.usn !== req.params.usn) return res.status(403).json({ error: "Students may only edit their own record" });
  const parsed = residenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const updated = await prisma.student.update({ where: { usn: req.params.usn }, data: parsed.data });
  res.json(updated);
});
