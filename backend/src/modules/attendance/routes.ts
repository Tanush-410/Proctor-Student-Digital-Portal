import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { logAudit } from "../../lib/audit";

export const attendanceRouter = safeRouter();

const STATUSES = ["PRESENT", "ABSENT", "LATE"] as const;

const markSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  records: z
    .array(z.object({ usn: z.string().min(1), status: z.enum(STATUSES) }))
    .min(1)
    .max(500),
});

// POST /attendance/mark — mark (or amend — upsert on the usn+date unique
// constraint, so re-marking the same day just corrects it) a day's attendance
// for several students at once. Same skip-and-report shape as every other
// bulk endpoint (Section 4.2): a usn outside the caller's proctee list is
// skipped, not enough to fail the whole batch. Admin may mark for anyone.
attendanceRouter.post("/attendance/mark", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = markSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { date, records } = parsed.data;

  const usns = records.map((r) => r.usn);
  const students = await prisma.student.findMany({ where: { usn: { in: usns } } });
  const studentByUsn = new Map(students.map((s) => [s.usn, s]));

  const skipped: { usn: string; reason: string }[] = [];
  let marked = 0;

  for (const r of records) {
    const student = studentByUsn.get(r.usn);
    if (!student) {
      skipped.push({ usn: r.usn, reason: "Unknown USN" });
      continue;
    }
    if (req.auth!.role === "PROCTOR" && student.proctorId !== req.auth!.facultyId) {
      skipped.push({ usn: r.usn, reason: "Not your proctee" });
      continue;
    }
    await prisma.attendanceRecord.upsert({
      where: { usn_date: { usn: r.usn, date } },
      create: { usn: r.usn, date, status: r.status, markedBy: req.auth!.facultyId! },
      update: { status: r.status, markedBy: req.auth!.facultyId! },
    });
    marked++;
  }

  logAudit(req, "MARK_ATTENDANCE", "AttendanceRecord", date, { marked, skipped: skipped.length });
  res.status(201).json({ marked, skipped });
});

// GET /attendance?usn=&date=&from=&to= — Student is always scoped to their
// own usn; Proctor defaults to their own proctees (optionally narrowed to one
// usn, which must be their own); Admin can query anyone.
attendanceRouter.get("/attendance", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const dateFilter: any = {};
  if (req.query.date) dateFilter.date = req.query.date as string;
  if (req.query.from || req.query.to) {
    dateFilter.date = { ...(req.query.from ? { gte: req.query.from as string } : {}), ...(req.query.to ? { lte: req.query.to as string } : {}) };
  }

  if (req.auth!.role === "STUDENT") {
    const records = await prisma.attendanceRecord.findMany({ where: { usn: req.auth!.usn!, ...dateFilter }, orderBy: { date: "desc" } });
    return res.json(records);
  }

  const usn = req.query.usn as string | undefined;
  if (usn) {
    if (req.auth!.role === "PROCTOR") {
      const student = await prisma.student.findUnique({ where: { usn } });
      if (!student || student.proctorId !== req.auth!.facultyId) return res.status(403).json({ error: "Not your proctee" });
    }
    const records = await prisma.attendanceRecord.findMany({ where: { usn, ...dateFilter }, orderBy: { date: "desc" } });
    return res.json(records);
  }

  // No usn — a whole-day/roster view. Proctor sees only their own proctees'
  // rows; Admin sees everyone (still date-bounded to keep the response sane).
  const where: any = { ...dateFilter };
  if (req.auth!.role === "PROCTOR") {
    const proctees = await prisma.student.findMany({ where: { proctorId: req.auth!.facultyId! }, select: { usn: true } });
    where.usn = { in: proctees.map((p) => p.usn) };
  } else if (!req.query.date && !req.query.from) {
    return res.status(400).json({ error: "Admin roster queries need at least ?date= or ?from=" });
  }
  const records = await prisma.attendanceRecord.findMany({ where, orderBy: { date: "desc" }, take: 1000 });
  res.json(records);
});

// GET /students/:usn/attendance/summary — present/absent/late counts and
// percentage, for the stat tiles on the student/proctor/admin detail views.
attendanceRouter.get("/students/:usn/attendance/summary", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (req.auth!.role === "STUDENT" && req.auth!.usn !== usn) {
    return res.status(403).json({ error: "Students may only view their own attendance" });
  }
  if (req.auth!.role === "PROCTOR") {
    const student = await prisma.student.findUnique({ where: { usn } });
    if (!student || student.proctorId !== req.auth!.facultyId) return res.status(403).json({ error: "Not your proctee" });
  }

  const records = await prisma.attendanceRecord.findMany({ where: { usn }, orderBy: { date: "desc" } });
  const present = records.filter((r) => r.status === "PRESENT").length;
  const absent = records.filter((r) => r.status === "ABSENT").length;
  const late = records.filter((r) => r.status === "LATE").length;
  const total = records.length;

  res.json({
    total,
    present,
    absent,
    late,
    percentage: total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : null,
    recent: records.slice(0, 30),
  });
});

// GET /admin/attendance/analytics?from=&to= — department-wide attendance %
// by section, for the HOD dashboard. Defaults to the last 30 days.
attendanceRouter.get("/admin/attendance/analytics", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const to = (req.query.to as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const from = (req.query.from as string | undefined) ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [students, records] = await Promise.all([
    prisma.student.findMany({ select: { usn: true, section: true } }),
    prisma.attendanceRecord.findMany({ where: { date: { gte: from, lte: to } } }),
  ]);
  const sectionByUsn = new Map(students.map((s) => [s.usn, s.section ?? "Unassigned"]));

  const bySection = new Map<string, { present: number; total: number }>();
  for (const r of records) {
    const section = sectionByUsn.get(r.usn) ?? "Unassigned";
    const bucket = bySection.get(section) ?? { present: 0, total: 0 };
    bucket.total++;
    if (r.status === "PRESENT" || r.status === "LATE") bucket.present++;
    bySection.set(section, bucket);
  }

  const totalPresent = records.filter((r) => r.status === "PRESENT" || r.status === "LATE").length;

  res.json({
    from,
    to,
    recordCount: records.length,
    overallPercentage: records.length > 0 ? Math.round((totalPresent / records.length) * 1000) / 10 : null,
    bySection: [...bySection.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([section, b]) => ({ section, percentage: b.total > 0 ? Math.round((b.present / b.total) * 1000) / 10 : null, recordCount: b.total })),
  });
});
