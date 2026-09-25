import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { logAudit } from "../../lib/audit";
import { computeCGPA, getBacklogSubjects, resolvePrecedence } from "../results/engine";
import { callerCluster } from "../../lib/cluster";

export const facultyRouter = safeRouter();

// GET /proctors — list/search the faculty directory. An Admin/HOD defaults to
// their own cluster (?allClusters=true opts out) since each cluster has its
// own HOD who should land on their own proctors first — but every cluster's
// data is still one department, so nothing stops them viewing another
// cluster's roster too. A Proctor session is unfiltered — the faculty
// directory has always been broadly readable to proctors (Section 9), and
// this feature is specifically about admin/HOD scoping.
// A Student session only ever sees their own proctor's entry (Section 9).
facultyRouter.get("/proctors", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  if (req.auth!.role === "STUDENT") {
    const student = await prisma.student.findUnique({ where: { usn: req.auth!.usn! }, include: { proctor: true } });
    return res.json(student?.proctor ? [student.proctor] : []);
  }

  const q = (req.query.q as string | undefined)?.trim();
  const allClusters = req.query.allClusters === "true";
  const where: Prisma.FacultyWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { shortCode: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }
  if (req.auth!.role === "ADMIN" && !allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.cluster = cluster;
  }

  const faculty = await prisma.faculty.findMany({ where, orderBy: { name: "asc" } });
  res.json(faculty);
});

// GET /proctors/count — total count for the Admin dashboard stat tile.
// Same cluster default as GET /proctors.
facultyRouter.get("/proctors/count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const allClusters = req.query.allClusters === "true";
  const where: Prisma.FacultyWhereInput = {};
  if (req.auth!.role === "ADMIN" && !allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.cluster = cluster;
  }
  const count = await prisma.faculty.count({ where });
  res.json({ count });
});

// GET /proctors/:id — full faculty detail: their own info, proctees (if any),
// and recent activity. Any Admin/Proctor can view any faculty member's detail
// — the access matrix already treats the faculty directory as broadly
// readable (Section 9), and this is directory information, not a student's
// private record.
facultyRouter.get("/proctors/:id", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid faculty id" });

  const faculty = await prisma.faculty.findUnique({ where: { facultyId: id } });
  if (!faculty) return res.status(404).json({ error: "Faculty not found" });

  const [proctees, ptmRecords, claimsReviewed, importBatches] = await Promise.all([
    prisma.student.findMany({ where: { proctorId: id }, orderBy: { usn: "asc" } }),
    prisma.ptmRecord.findMany({ where: { proctorId: id }, orderBy: { ptmDate: "desc" }, take: 10, include: { student: { select: { name: true, usn: true, section: true } } } }),
    prisma.activityPointClaim.findMany({
      where: { proctorId: id, status: { not: "PENDING" } },
      orderBy: { reviewedAt: "desc" },
      take: 10,
      include: { student: { select: { name: true, usn: true } } },
    }),
    prisma.importBatch.findMany({ where: { uploadedBy: id }, orderBy: { uploadedAt: "desc" }, take: 10 }),
  ]);

  res.json({ faculty, proctees, ptmRecords, claimsReviewed, importBatches });
});

// GET /proctors/:id/analytics — aggregate stats across a proctor's proctees:
// average CGPA, backlog counts, an "at-risk" shortlist. Computed on the fly
// from the same effective-results engine everything else uses (Section 8.2),
// not a separately maintained number that could drift.
facultyRouter.get("/proctors/:id/analytics", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid faculty id" });
  if (req.auth!.role === "PROCTOR" && req.auth!.facultyId !== id) {
    return res.status(403).json({ error: "Proctors may only view their own analytics" });
  }

  const students = await prisma.student.findMany({ where: { proctorId: id } });
  if (students.length === 0) {
    return res.json({ proctee_count: 0, avgCgpa: null, backlogCount: 0, pendingClaims: 0, atRisk: [] });
  }
  const usns = students.map((s) => s.usn);

  const [allRecords, pendingClaims] = await Promise.all([
    prisma.resultRecord.findMany({ where: { usn: { in: usns } } }),
    prisma.activityPointClaim.count({ where: { proctorId: id, status: "PENDING" } }),
  ]);

  const recordsByUsn = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const arr = recordsByUsn.get(r.usn) ?? [];
    arr.push(r);
    recordsByUsn.set(r.usn, arr);
  }

  let cgpaSum = 0;
  let cgpaCount = 0;
  let backlogCount = 0;
  const perStudent: { usn: string; name: string; section: string | null; cgpa: number | null; backlogs: number }[] = [];

  for (const s of students) {
    const effective = resolvePrecedence(recordsByUsn.get(s.usn) ?? []);
    const cgpa = computeCGPA(effective);
    const backlogs = getBacklogSubjects(effective).length;
    if (cgpa !== null) {
      cgpaSum += cgpa;
      cgpaCount++;
    }
    backlogCount += backlogs;
    perStudent.push({ usn: s.usn, name: s.name, section: s.section, cgpa, backlogs });
  }

  // At-risk: has a backlog, or (has a CGPA and it's below 6) — worth a proctor's attention first.
  const atRisk = perStudent
    .filter((p) => p.backlogs > 0 || (p.cgpa !== null && p.cgpa < 6))
    .sort((a, b) => b.backlogs - a.backlogs || (a.cgpa ?? 10) - (b.cgpa ?? 10))
    .slice(0, 10);

  res.json({
    proctee_count: students.length,
    avgCgpa: cgpaCount > 0 ? Math.round((cgpaSum / cgpaCount) * 100) / 100 : null,
    backlogCount,
    pendingClaims,
    atRisk,
  });
});

// GET /admin/workload — proctee-count balance across proctors, for the HOD
// to spot lopsided loads. Defaults to the caller's own cluster
// (?allClusters=true opts out), same as GET /proctors. Admin-only; a Proctor
// already sees their own count via /proctors/:id/analytics.
facultyRouter.get("/admin/workload", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const allClusters = req.query.allClusters === "true";
  const where: Prisma.FacultyWhereInput = { role: "PROCTOR" };
  if (!allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.cluster = cluster;
  }
  const proctors = await prisma.faculty.findMany({ where, orderBy: { name: "asc" } });
  const counts = await prisma.student.groupBy({ by: ["proctorId"], _count: { usn: true } });
  const countByProctor = new Map(counts.filter((c) => c.proctorId !== null).map((c) => [c.proctorId as number, c._count.usn]));
  // Unassigned proctees have no proctor to inherit a cluster from, so this
  // count is always department-wide regardless of cluster scope.
  const unassignedCount = counts.find((c) => c.proctorId === null)?._count.usn ?? 0;

  const rows = proctors.map((p) => ({
    facultyId: p.facultyId,
    name: p.name,
    shortCode: p.shortCode,
    procteeCount: countByProctor.get(p.facultyId) ?? 0,
  }));
  const loads = rows.map((r) => r.procteeCount);
  const avg = loads.length ? Math.round((loads.reduce((a, b) => a + b, 0) / loads.length) * 10) / 10 : 0;

  res.json({
    proctors: rows.sort((a, b) => b.procteeCount - a.procteeCount),
    unassignedCount,
    avgLoad: avg,
    minLoad: loads.length ? Math.min(...loads) : 0,
    maxLoad: loads.length ? Math.max(...loads) : 0,
  });
});

// GET /admin/analytics — rollup of the same effective-results engine used
// per-proctor (Section 8.2), aggregated across students: overall
// CGPA/backlog/at-risk numbers plus a section-wise and semester-wise
// breakdown, for the HOD dashboard. Defaults to the caller's own cluster
// (?allClusters=true opts out for the department-wide rollup).
facultyRouter.get("/admin/analytics", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const allClusters = req.query.allClusters === "true";
  const where: Prisma.StudentWhereInput = {};
  if (!allClusters) {
    const cluster = await callerCluster(req.auth!.facultyId);
    if (cluster) where.proctor = { cluster };
  }
  const students = await prisma.student.findMany({ where });
  if (students.length === 0) {
    return res.json({ studentCount: 0, avgCgpa: null, backlogCount: 0, atRiskCount: 0, bySection: [], bySemester: [] });
  }

  const allRecords = await prisma.resultRecord.findMany({ where: { usn: { in: students.map((s) => s.usn) } } });
  const recordsByUsn = new Map<string, typeof allRecords>();
  for (const r of allRecords) {
    const arr = recordsByUsn.get(r.usn) ?? [];
    arr.push(r);
    recordsByUsn.set(r.usn, arr);
  }

  interface Row {
    usn: string;
    section: string | null;
    semester: number;
    cgpa: number | null;
    backlogs: number;
  }
  const perStudent: Row[] = students.map((s) => {
    const effective = resolvePrecedence(recordsByUsn.get(s.usn) ?? []);
    return { usn: s.usn, section: s.section, semester: s.currentSemester, cgpa: computeCGPA(effective), backlogs: getBacklogSubjects(effective).length };
  });

  function summarize(rows: Row[]) {
    const withCgpa = rows.filter((r) => r.cgpa !== null);
    const avgCgpa = withCgpa.length ? Math.round((withCgpa.reduce((s, r) => s + (r.cgpa as number), 0) / withCgpa.length) * 100) / 100 : null;
    const backlogCount = rows.reduce((s, r) => s + r.backlogs, 0);
    const atRiskCount = rows.filter((r) => r.backlogs > 0 || (r.cgpa !== null && r.cgpa < 6)).length;
    return { studentCount: rows.length, avgCgpa, backlogCount, atRiskCount };
  }

  const bySectionMap = new Map<string, Row[]>();
  const bySemesterMap = new Map<number, Row[]>();
  for (const r of perStudent) {
    const secKey = r.section ?? "Unassigned";
    bySectionMap.set(secKey, [...(bySectionMap.get(secKey) ?? []), r]);
    bySemesterMap.set(r.semester, [...(bySemesterMap.get(r.semester) ?? []), r]);
  }

  res.json({
    ...summarize(perStudent),
    bySection: [...bySectionMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([section, rows]) => ({ section, ...summarize(rows) })),
    bySemester: [...bySemesterMap.entries()].sort((a, b) => a[0] - b[0]).map(([semester, rows]) => ({ semester, ...summarize(rows) })),
  });
});

// GET /proctors/:id/students — list a proctor's proctees.
facultyRouter.get("/proctors/:id/students", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (req.auth!.role === "PROCTOR" && req.auth!.facultyId !== id) {
    return res.status(403).json({ error: "Proctors may only list their own proctees" });
  }
  const students = await prisma.student.findMany({ where: { proctorId: id }, orderBy: { usn: "asc" } });
  res.json(students);
});

// E-mail is normalised to lower-case here so it always matches the lookup in
// POST /auth/otp/request, which lowercases the caller's input before querying
// (Section 9: identity resolution has to be consistent or logins silently break).
const facultySchema = z.object({
  staffId: z.string().min(1),
  name: z.string().min(1),
  shortCode: z.string().min(1).max(10),
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  role: z.enum(["ADMIN", "PROCTOR"]),
  cabinNo: z.string().optional(),
  telecomNo: z.string().optional(),
  phone: z.string().optional(),
  // A/B/C/D/E departmental cluster; null means unassigned.
  cluster: z.enum(["A", "B", "C", "D", "E"]).nullable().optional(),
});

// POST /faculty — onboard a new proctor/HOD. Not in the original design doc's
// use-case diagrams (faculty accounts were assumed pre-existing), but an Admin
// portal with no way to add a proctor can't actually be operated day to day.
facultyRouter.post("/faculty", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const parsed = facultySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const faculty = await prisma.faculty.create({ data: parsed.data });
    logAudit(req, "CREATE", "Faculty", String(faculty.facultyId), { name: faculty.name, role: faculty.role });
    res.status(201).json(faculty);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Short code or e-mail already in use" });
    }
    throw err;
  }
});

const facultyUpdateSchema = facultySchema.partial();

// PATCH /faculty/:id — edit an existing faculty record.
facultyRouter.patch("/faculty/:id", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const parsed = facultyUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const faculty = await prisma.faculty.update({ where: { facultyId: id }, data: parsed.data });
    logAudit(req, "UPDATE", "Faculty", String(id), { fields: Object.keys(parsed.data) });
    res.json(faculty);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") return res.status(409).json({ error: "Short code or e-mail already in use" });
      if (err.code === "P2025") return res.status(404).json({ error: "Faculty not found" });
    }
    throw err;
  }
});

// GET /directory/search?q= — searchDirectory: matches short code, faculty name, student name, or USN.
// Capped at 25 results per side — this is a quick-lookup tool, not a browse-all
// view, and a broad query (a single common letter) could otherwise match
// hundreds of the 3000 students and ship them all in one response.
const DIRECTORY_SEARCH_LIMIT = 25;
facultyRouter.get("/directory/search", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";
  if (!q) return res.json({ faculty: [], students: [] });

  const [faculty, students] = await Promise.all([
    prisma.faculty.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { shortCode: { contains: q, mode: "insensitive" } }] },
      take: DIRECTORY_SEARCH_LIMIT,
    }),
    prisma.student.findMany({
      where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { usn: { contains: q, mode: "insensitive" } }] },
      take: DIRECTORY_SEARCH_LIMIT,
    }),
  ]);
  res.json({ faculty, students });
});
