import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { logAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";
import { computeCGPA, getBacklogSubjects, resolvePrecedence } from "../results/engine";
import { callerCluster } from "../../lib/cluster";

export const studentsRouter = safeRouter();

function canView(auth: NonNullable<AuthedRequest["auth"]>, student: { proctorId: number | null; usn: string }): boolean {
  if (auth.role === "ADMIN") return true;
  if (auth.role === "PROCTOR") return true; // matrix: proctor can Read even another proctor's proctee
  if (auth.role === "STUDENT") return auth.usn === student.usn;
  return false;
}

// GET /students — list/search (Admin, Proctor only). Proctor sees own
// proctees by default (?mine=true). Admin defaults to their own cluster's
// students (?allClusters=true opts out) — a student's cluster is inherited
// from their proctor, since clusters are tagged per-proctor, not per-student.
// ?limit=&offset= cap an unscoped call (e.g. Admin browsing everyone) at a sane
// page size instead of shipping every row — a proctor's own list (?mine=true)
// is naturally small (tens of students) so the default limit never engages for it.
studentsRouter.get("/", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const mineOnly = req.query.mine === "true";
  const allClusters = req.query.allClusters === "true";
  const where: any = {};
  if (mineOnly && req.auth!.role === "PROCTOR") where.proctorId = req.auth!.facultyId;
  if (req.auth!.role === "ADMIN" && !allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.proctor = { cluster };
  }
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { usn: { contains: q, mode: "insensitive" } }];

  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const students = await prisma.student.findMany({ where, orderBy: { usn: "asc" }, take: limit, skip: offset });
  res.json(students);
});

// GET /students/count — total count for the Admin dashboard stat tile, without
// shipping all 3000 student rows over the wire just to read .length client-side.
// Same cluster default as GET /students.
studentsRouter.get("/count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const allClusters = req.query.allClusters === "true";
  const where: any = {};
  if (req.auth!.role === "ADMIN" && !allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.proctor = { cluster };
  }
  const count = await prisma.student.count({ where });
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
  if (req.auth!.role !== "STUDENT") logAudit(req, "VIEW", "Student", student.usn);
  res.json(student);
});

// PATCH /students/:usn/proctor — Admin reassigns a student to a different
// proctor (or unassigns with proctorId: null). Proctor-student assignment was
// previously fixed at import time with no fix-up path — this is the rebalance
// lever for the workload view (GET /admin/workload).
const reassignSchema = z.object({ proctorId: z.number().int().nullable() });
studentsRouter.patch("/:usn/proctor", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = reassignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  if (parsed.data.proctorId !== null) {
    const newProctor = await prisma.faculty.findUnique({ where: { facultyId: parsed.data.proctorId } });
    if (!newProctor || newProctor.role !== "PROCTOR") return res.status(400).json({ error: "Target faculty is not a proctor" });
  }

  const updated = await prisma.student.update({ where: { usn: req.params.usn }, data: { proctorId: parsed.data.proctorId } });
  logAudit(req, "REASSIGN", "Student", student.usn, { from: student.proctorId, to: parsed.data.proctorId });
  if (parsed.data.proctorId !== null) {
    notify(parsed.data.proctorId, "PROCTEE_ASSIGNED", `${student.name} assigned to you`, `${student.usn} was reassigned to your proctee list.`, `/proctor/students/${student.usn}`);
  }
  if (student.proctorId !== null && student.proctorId !== parsed.data.proctorId) {
    notify(student.proctorId, "PROCTEE_REMOVED", `${student.name} reassigned`, `${student.usn} was moved to a different proctor.`);
  }
  res.json(updated);
});

// GET /students/:usn/notes — a proctor/admin's private remarks on a student.
// Staff-only (not exposed to the student themselves) — these are working
// observations ("spoke to parents", "recommend for scholarship"), not a
// student-facing communication channel.
studentsRouter.get("/:usn/notes", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const notes = await prisma.studentNote.findMany({
    where: { usn: req.params.usn },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, shortCode: true } } },
  });
  res.json(notes);
});

const noteSchema = z.object({ note: z.string().min(1).max(2000) });

// POST /students/:usn/notes — add a remark. A Proctor may only do this for their own proctee.
studentsRouter.post("/:usn/notes", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (req.auth!.role === "PROCTOR" && student.proctorId !== req.auth!.facultyId) {
    return res.status(403).json({ error: "Proctors may only add notes for their own proctees" });
  }

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const note = await prisma.studentNote.create({
    data: { usn: req.params.usn, authorId: req.auth!.facultyId!, note: parsed.data.note },
    include: { author: { select: { name: true, shortCode: true } } },
  });
  logAudit(req, "CREATE", "StudentNote", String(note.id), { usn: req.params.usn });
  res.status(201).json(note);
});

// POST /students/notes/bulk — log the same remark against several proctees at
// once (a batch PTM's shared observation, "attended semester meeting"). Same
// exception-queue shape as every other bulk ingestion (Section 4.2): a usn
// outside the caller's proctee list is skipped and reported, not silently
// dropped and not enough to fail the whole batch.
const bulkNoteSchema = z.object({ usns: z.array(z.string().min(1)).min(1).max(200), note: z.string().min(1).max(2000) });
studentsRouter.post("/notes/bulk", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = bulkNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const students = await prisma.student.findMany({ where: { usn: { in: parsed.data.usns } } });
  const studentByUsn = new Map(students.map((s) => [s.usn, s]));

  const skipped: { usn: string; reason: string }[] = [];
  const toCreate: string[] = [];
  for (const usn of parsed.data.usns) {
    const student = studentByUsn.get(usn);
    if (!student) {
      skipped.push({ usn, reason: "Unknown USN" });
      continue;
    }
    if (req.auth!.role === "PROCTOR" && student.proctorId !== req.auth!.facultyId) {
      skipped.push({ usn, reason: "Not your proctee" });
      continue;
    }
    toCreate.push(usn);
  }

  if (toCreate.length > 0) {
    await prisma.studentNote.createMany({ data: toCreate.map((usn) => ({ usn, authorId: req.auth!.facultyId!, note: parsed.data.note })) });
    logAudit(req, "CREATE", "StudentNote", "bulk", { usns: toCreate });
  }
  res.status(201).json({ created: toCreate.length, skipped });
});

// DELETE /students/:usn/notes/:id — the author, or an Admin, can remove a note.
studentsRouter.delete("/:usn/notes/:id", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const note = await prisma.studentNote.findUnique({ where: { id } });
  if (!note || note.usn !== req.params.usn) return res.status(404).json({ error: "Note not found" });
  if (req.auth!.role !== "ADMIN" && note.authorId !== req.auth!.facultyId) {
    return res.status(403).json({ error: "Only the author or an Admin may delete this note" });
  }
  await prisma.studentNote.delete({ where: { id } });
  logAudit(req, "DELETE", "StudentNote", String(id), { usn: req.params.usn });
  res.json({ ok: true });
});

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0;
  const below = allValues.filter((v) => v < value).length;
  return Math.round((below / allValues.length) * 100);
}

// GET /students/:usn/analytics/comparison — how this student's CGPA/backlogs
// stack up against their own section and the wider semester cohort: averages,
// percentile rank, and a CGPA-bucket distribution for a histogram. Backs both
// the student's own dashboard and the proctor/admin detail view.
studentsRouter.get("/:usn/analytics/comparison", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!canView(req.auth!, student)) return res.status(403).json({ error: "Not authorized to view this student" });

  const [sectionPeers, semesterPeers] = await Promise.all([
    student.section ? prisma.student.findMany({ where: { section: student.section, currentSemester: student.currentSemester } }) : Promise.resolve([student]),
    prisma.student.findMany({ where: { currentSemester: student.currentSemester } }),
  ]);

  const allRecords = await prisma.resultRecord.findMany({ where: { usn: { in: semesterPeers.map((s) => s.usn) } } });
  const recordsByUsn = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const arr = recordsByUsn.get(r.usn) ?? [];
    arr.push(r);
    recordsByUsn.set(r.usn, arr);
  }

  function cgpaOf(usn: string): number | null {
    return computeCGPA(resolvePrecedence(recordsByUsn.get(usn) ?? []));
  }
  function backlogsOf(usn: string): number {
    return getBacklogSubjects(resolvePrecedence(recordsByUsn.get(usn) ?? [])).length;
  }

  const ownCgpa = cgpaOf(student.usn);
  const ownBacklogs = backlogsOf(student.usn);

  function summarizeGroup(usns: string[]) {
    const cgpas = usns.map(cgpaOf).filter((c): c is number => c !== null);
    const avgCgpa = cgpas.length ? Math.round((cgpas.reduce((a, b) => a + b, 0) / cgpas.length) * 100) / 100 : null;
    const sortedDesc = [...cgpas].sort((a, b) => b - a);
    const rank = ownCgpa !== null ? sortedDesc.findIndex((c) => c <= ownCgpa) + 1 : null;
    const buckets = [0, 2, 4, 6, 8, 10].map((lo, i, arr) => {
      const hi = arr[i + 1];
      const count = hi === undefined ? 0 : cgpas.filter((c) => c >= lo && c < hi).length;
      return { range: hi === undefined ? `${lo}+` : `${lo}-${hi}`, count };
    });
    return {
      count: usns.length,
      avgCgpa,
      percentile: ownCgpa !== null ? percentileRank(ownCgpa, cgpas) : null,
      rank: rank && rank > 0 ? rank : null,
      of: cgpas.length,
      distribution: buckets,
    };
  }

  res.json({
    usn: student.usn,
    cgpa: ownCgpa,
    backlogs: ownBacklogs,
    section: student.section
      ? { label: student.section, ...summarizeGroup(sectionPeers.map((s) => s.usn)) }
      : null,
    semester: { label: `Semester ${student.currentSemester}`, ...summarizeGroup(semesterPeers.map((s) => s.usn)) },
  });
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
  logAudit(req, "UPDATE", "Student", req.params.usn, { fields: Object.keys(parsed.data) });
  res.json(updated);
});
