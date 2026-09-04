import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { UPLOADS_DIR } from "../../lib/config";
import { InvalidFileTypeError } from "../../lib/errors";
import { logAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";

export const activityPointsRouter = safeRouter();

const proofDir = path.join(UPLOADS_DIR, "proofs");
fs.mkdirSync(proofDir, { recursive: true });

// Extension is taken from a fixed lookup table, never from the caller's
// filename — a proof named "cert.html" or "cert.svg" (SVG can carry inline
// <script>) used to be written to disk with that same extension and served
// back as-is. Combined with the GET route below forcing a download instead
// of an inline render, a proof file can no longer execute as a page in this
// app's origin no matter what content sneaks past the MIME whitelist.
const ALLOWED_PROOF_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, proofDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${ALLOWED_PROOF_TYPES[file.mimetype] ?? ""}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PROOF_TYPES[file.mimetype]) {
      return cb(new InvalidFileTypeError("Only JPEG/PNG/WEBP/GIF images or a PDF are accepted as proof"));
    }
    cb(null, true);
  },
});

// GET /activity-points/uploads/proofs/:filename — serves a proof file, but
// only to someone the access matrix (Section 9) already allows to see the
// claim it belongs to: the submitting student, that claim's proctor, or an
// Admin. Forced to download (Content-Disposition: attachment) rather than
// render inline — belt-and-suspenders alongside the upload-time type
// whitelist above, so nothing served from here can ever execute as a page
// in this app's origin.
activityPointsRouter.get("/uploads/proofs/:filename", requireAuth, async (req: AuthedRequest, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{32}\.\w{1,5}$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const claim = await prisma.activityPointClaim.findFirst({ where: { proofFile: `/uploads/proofs/${filename}` } });
  if (!claim) return res.status(404).json({ error: "Not found" });

  const auth = req.auth!;
  const allowed = auth.role === "ADMIN" || (auth.role === "PROCTOR" && claim.proctorId === auth.facultyId) || (auth.role === "STUDENT" && claim.usn === auth.usn);
  if (!allowed) return res.status(403).json({ error: "Not authorized to view this file" });

  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(proofDir, filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File missing on disk" });
  });
});

async function computeRunningTotal(usn: string): Promise<number> {
  const approved = await prisma.activityPointClaim.findMany({ where: { usn, status: "APPROVED" } });
  return approved.reduce((sum, c) => sum + (c.grantedPoints ?? 0), 0);
}

const claimSchema = z.object({
  description: z.string().min(1),
  requestedPoints: z.coerce.number().int().positive(),
});

// POST /activity-points/claims — submit a new claim.
activityPointsRouter.post("/activity-points/claims", requireAuth, requireRole("STUDENT"), upload.single("proof"), async (req: AuthedRequest, res) => {
  const parsed = claimSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const student = await prisma.student.findUnique({ where: { usn: req.auth!.usn! } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const claim = await prisma.activityPointClaim.create({
    data: {
      usn: student.usn,
      proctorId: student.proctorId,
      proofFile: req.file ? `/uploads/proofs/${req.file.filename}` : null,
      description: parsed.data.description,
      requestedPoints: parsed.data.requestedPoints,
      status: "PENDING",
    },
  });
  if (student.proctorId) {
    notify(student.proctorId, "CLAIM_SUBMITTED", `${student.name} submitted a claim`, `${parsed.data.requestedPoints} pts — "${parsed.data.description}"`, `/proctor/activity-points`);
  }
  res.status(201).json(claim);
});

// GET /activity-points/claims?proctor_id= — list claims for review.
// proctor_id is honoured only for Admin; a Proctor session is always scoped to
// their own facultyId regardless of what the query string says (Section 9).
activityPointsRouter.get("/activity-points/claims", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const status = (req.query.status as string | undefined)?.toUpperCase();
  const where: any = {};
  if (status) where.status = status;

  if (req.auth!.role === "PROCTOR") {
    where.proctorId = req.auth!.facultyId;
  } else if (req.query.proctor_id) {
    where.proctorId = parseInt(req.query.proctor_id as string, 10);
  }

  const claims = await prisma.activityPointClaim.findMany({
    where,
    include: { student: { select: { name: true, usn: true, section: true } } },
    orderBy: { submittedAt: "desc" },
    // An Admin with no proctor_id filter is browsing across every claim in the
    // department (potentially thousands at 3000 students) — cap it to the most
    // recent 200 rather than shipping everything in one response.
    take: req.auth!.role === "ADMIN" && !where.proctorId ? 200 : undefined,
  });
  res.json(claims);
});

// GET /students/:usn/activity-points — a student's own claims + running total.
activityPointsRouter.get("/students/:usn/activity-points", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (req.auth!.role === "STUDENT" && req.auth!.usn !== usn) {
    return res.status(403).json({ error: "Students may only view their own claims" });
  }
  if (req.auth!.role === "PROCTOR") {
    const student = await prisma.student.findUnique({ where: { usn } });
    if (!student || student.proctorId !== req.auth!.facultyId) {
      return res.status(403).json({ error: "Not your proctee" });
    }
  }
  const claims = await prisma.activityPointClaim.findMany({ where: { usn }, orderBy: { submittedAt: "desc" } });
  res.json({ claims, runningTotal: await computeRunningTotal(usn) });
});

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  grantedPoints: z.number().int().min(0).optional(),
  remarks: z.string().optional(),
});

// PATCH /activity-points/claims/:id/review — approve/reject a claim.
activityPointsRouter.patch("/activity-points/claims/:id/review", requireAuth, requireRole("PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const claim = await prisma.activityPointClaim.findUnique({ where: { claimId: id } });
  if (!claim) return res.status(404).json({ error: "Claim not found" });
  if (claim.proctorId !== req.auth!.facultyId) return res.status(403).json({ error: "Not your proctee's claim" });
  if (claim.status !== "PENDING") return res.status(409).json({ error: "Claim already reviewed" });

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, grantedPoints, remarks } = parsed.data;

  if (decision === "APPROVED" && (grantedPoints === undefined || grantedPoints > claim.requestedPoints)) {
    return res.status(400).json({ error: "grantedPoints must be provided and <= requestedPoints" });
  }

  const updated = await prisma.activityPointClaim.update({
    where: { claimId: id },
    data: {
      status: decision,
      grantedPoints: decision === "APPROVED" ? grantedPoints : null,
      remarks,
      reviewedAt: new Date(),
    },
  });

  logAudit(req, decision === "APPROVED" ? "APPROVE" : "REJECT", "ActivityPointClaim", String(id), { usn: claim.usn, grantedPoints });
  res.json({ claim: updated, runningTotal: await computeRunningTotal(claim.usn) });
});

/** Shared aggregation for the analytics endpoint and the PDF report — total
 * approved points per student, rolled up by section, plus a leaderboard.
 * Only APPROVED claims count (a pending/rejected claim isn't "claimed" yet
 * in the sense a section total or leaderboard should reflect). */
export async function computeActivityPointsAnalytics() {
  const [students, claims] = await Promise.all([
    prisma.student.findMany({ select: { usn: true, name: true, section: true } }),
    prisma.activityPointClaim.findMany({ select: { usn: true, status: true, requestedPoints: true, grantedPoints: true } }),
  ]);

  const approvedByUsn = new Map<string, number>();
  let totalApprovedPoints = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  for (const c of claims) {
    if (c.status === "PENDING") pendingCount++;
    else if (c.status === "APPROVED") {
      approvedCount++;
      const pts = c.grantedPoints ?? 0;
      totalApprovedPoints += pts;
      approvedByUsn.set(c.usn, (approvedByUsn.get(c.usn) ?? 0) + pts);
    } else if (c.status === "REJECTED") rejectedCount++;
  }

  const bySectionMap = new Map<string, { points: number; students: number }>();
  for (const s of students) {
    const key = s.section ?? "Unassigned";
    const bucket = bySectionMap.get(key) ?? { points: 0, students: 0 };
    bucket.points += approvedByUsn.get(s.usn) ?? 0;
    bucket.students += 1;
    bySectionMap.set(key, bucket);
  }
  const bySection = [...bySectionMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([section, b]) => ({ section, totalPoints: b.points, studentCount: b.students }));

  const leaderboard = students
    .map((s) => ({ usn: s.usn, name: s.name, section: s.section, points: approvedByUsn.get(s.usn) ?? 0 }))
    .filter((s) => s.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 15);

  return {
    totalStudents: students.length,
    totalClaims: claims.length,
    pendingCount,
    approvedCount,
    rejectedCount,
    totalApprovedPoints,
    bySection,
    leaderboard,
  };
}

// GET /admin/activity-points/analytics — section totals + leaderboard, for
// the HOD's Activity Points tab.
activityPointsRouter.get("/admin/activity-points/analytics", requireAuth, requireRole("ADMIN"), async (_req: AuthedRequest, res) => {
  res.json(await computeActivityPointsAnalytics());
});
