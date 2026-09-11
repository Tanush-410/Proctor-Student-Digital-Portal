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
import { notify } from "../../lib/notify";
import { logAudit } from "../../lib/audit";

export const markRequestsRouter = safeRouter();

// Same physical folder as activity-point-claim proofs (backend/uploads/proofs)
// — both are "proof of something" uploads, and the random-hex filename makes
// collisions between the two features a non-issue.
const proofDir = path.join(UPLOADS_DIR, "proofs");
fs.mkdirSync(proofDir, { recursive: true });

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

// GET /mark-requests/uploads/proofs/:filename — same forced-download,
// RBAC-checked-against-the-owning-row pattern as every other proof file in
// this app (see activityPoints/routes.ts for the fuller rationale).
markRequestsRouter.get("/mark-requests/uploads/proofs/:filename", requireAuth, async (req: AuthedRequest, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{32}\.\w{1,5}$/i.test(filename)) return res.status(400).json({ error: "Invalid filename" });

  const record = await prisma.markRequest.findFirst({ where: { proofFile: `/mark-requests/uploads/proofs/${filename}` } });
  if (!record) return res.status(404).json({ error: "Not found" });

  const auth = req.auth!;
  const allowed = auth.role === "ADMIN" || (auth.role === "PROCTOR" && record.proctorId === auth.facultyId) || (auth.role === "STUDENT" && record.usn === auth.usn);
  if (!allowed) return res.status(403).json({ error: "Not authorized to view this file" });

  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(proofDir, filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File missing on disk" });
  });
});

const submitSchema = z.object({
  subjectCode: z.string().trim().min(1),
  subjectName: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(8),
  requestType: z.enum(["REVALUATION", "CORRECTION"]),
  reason: z.string().trim().max(2000).optional(),
  proposedTotal: z.coerce.number().int().min(0).max(300).optional(),
  proposedGrade: z.string().trim().max(5).optional(),
});

// POST /mark-requests
// REVALUATION: a lightweight applied/not-applied marker. The outcome is
// decided by BMSCE's own external re-evaluation process, not this app — no
// reason or proof needed, and there is nothing to review or approve here.
// The proctor just gets visibility (StudentDetail's Re-Eval tab), and the
// marker is superseded the normal way once an updated official mark is
// uploaded.
// CORRECTION: the student is disputing a mark they believe was entered
// wrong. This DOES go through proctor review — reason, a proposed
// total+grade, and proof are all required, since approval directly rewrites
// the effective result (see the /review endpoint below).
markRequestsRouter.post("/mark-requests", requireAuth, requireRole("STUDENT"), upload.single("proof"), async (req: AuthedRequest, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const student = await prisma.student.findUnique({ where: { usn: req.auth!.usn! } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  if (data.requestType === "CORRECTION") {
    if (!data.reason) return res.status(400).json({ error: "Please explain why you believe this mark is wrong" });
    if (data.proposedTotal === undefined || !data.proposedGrade) {
      return res.status(400).json({ error: "Please provide what you believe the correct total and grade are" });
    }
    if (!req.file) return res.status(400).json({ error: "Proof is required to request a mark correction" });
  } else {
    // REVALUATION: idempotent — if already marked as applied for this
    // subject, just return the existing marker rather than creating a duplicate.
    const existing = await prisma.markRequest.findFirst({
      where: { usn: student.usn, subjectCode: data.subjectCode, semester: data.semester, requestType: "REVALUATION" },
    });
    if (existing) return res.status(200).json(existing);
  }

  const record = await prisma.markRequest.create({
    data: {
      usn: student.usn,
      proctorId: student.proctorId,
      subjectCode: data.subjectCode,
      subjectName: data.subjectName,
      semester: data.semester,
      requestType: data.requestType,
      reason: data.requestType === "CORRECTION" ? data.reason! : null,
      proposedTotal: data.requestType === "CORRECTION" ? data.proposedTotal : undefined,
      proposedGrade: data.requestType === "CORRECTION" ? data.proposedGrade : undefined,
      proofFile: req.file ? `/mark-requests/uploads/proofs/${req.file.filename}` : null,
      status: "PENDING",
    },
  });

  if (student.proctorId) {
    if (data.requestType === "REVALUATION") {
      notify(student.proctorId, "MARK_REQUEST_SUBMITTED", `${student.name} applied for revaluation`, `${data.subjectCode} — Sem ${data.semester}`, `/proctor/students/${student.usn}`);
    } else {
      notify(student.proctorId, "MARK_REQUEST_SUBMITTED", `${student.name} requested a mark correction`, `${data.subjectCode} — Sem ${data.semester}`, `/proctor/students/${student.usn}`);
    }
  }
  res.status(201).json(record);
});

// DELETE /mark-requests/:id — a student un-marking a subject they'd flagged
// as "applied for revaluation" (e.g. they changed their mind, or applied by
// mistake). Only ever applies to REVALUATION markers — a submitted
// CORRECTION is a formal dispute with proof attached and isn't retractable
// once filed.
markRequestsRouter.delete("/mark-requests/:id", requireAuth, requireRole("STUDENT"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const record = await prisma.markRequest.findUnique({ where: { id } });
  if (!record) return res.status(404).json({ error: "Not found" });
  if (record.usn !== req.auth!.usn) return res.status(403).json({ error: "Not your request" });
  if (record.requestType !== "REVALUATION") return res.status(400).json({ error: "Only a revaluation marker can be removed" });

  await prisma.markRequest.delete({ where: { id } });
  res.status(204).send();
});

// GET /students/:usn/mark-requests — a student's own history of these, plus
// (separately, for the "Re Eval" tab) their full raw result history so the
// old value that got superseded is still visible next to the request.
markRequestsRouter.get("/students/:usn/mark-requests", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (req.auth!.role === "STUDENT" && req.auth!.usn !== usn) {
    return res.status(403).json({ error: "Students may only view their own requests" });
  }
  if (req.auth!.role === "PROCTOR") {
    const student = await prisma.student.findUnique({ where: { usn } });
    if (!student || student.proctorId !== req.auth!.facultyId) return res.status(403).json({ error: "Not your proctee" });
  }
  const requests = await prisma.markRequest.findMany({ where: { usn }, orderBy: { submittedAt: "desc" } });
  res.json(requests);
});

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  remarks: z.string().trim().max(1000).optional(),
});

function statusForGrade(grade: string): string {
  const g = grade.toUpperCase();
  if (g === "F" || g === "AB") return "FAIL";
  return "PASS";
}

// PATCH /mark-requests/:id/review — a proctor approves or rejects a mark
// CORRECTION (revaluation markers have nothing to review — see the POST
// handler's comment). Approval writes a new, higher-precedence ResultRecord
// (sourceType CHALLENGE_REVAL) with the student's proposed total/grade, so
// it immediately becomes the effective mark everywhere — CGPA, the Results
// tab, the academic-status engine — without needing a re-upload.
markRequestsRouter.patch("/mark-requests/:id/review", requireAuth, requireRole("PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const record = await prisma.markRequest.findUnique({ where: { id } });
  if (!record) return res.status(404).json({ error: "Not found" });
  if (record.requestType !== "CORRECTION") return res.status(400).json({ error: "Revaluation markers don't need review" });
  if (record.proctorId !== req.auth!.facultyId) return res.status(403).json({ error: "Not your proctee's request" });
  if (record.status !== "PENDING") return res.status(409).json({ error: "This request has already been reviewed" });

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { decision, remarks } = parsed.data;

  if (decision === "APPROVED") {
    if (record.proposedTotal === null || !record.proposedGrade) {
      return res.status(400).json({ error: "This request is missing a proposed total/grade and can't be approved" });
    }
    // Snapshot credits from any existing record for this subject, so the
    // corrected mark still contributes correctly to SGPA/CGPA.
    const priorRecord = await prisma.resultRecord.findFirst({
      where: { usn: record.usn, subjectCode: record.subjectCode, semester: record.semester },
      orderBy: { uploadedAt: "desc" },
    });
    await prisma.resultRecord.create({
      data: {
        usn: record.usn,
        subjectCode: record.subjectCode,
        subjectName: record.subjectName ?? priorRecord?.subjectName,
        semester: record.semester,
        sourceType: "CHALLENGE_REVAL",
        totalMarks: record.proposedTotal,
        grade: record.proposedGrade,
        credits: priorRecord?.credits ?? 0,
        status: statusForGrade(record.proposedGrade),
        uploadedBy: req.auth!.facultyId,
      },
    });
  }

  const updated = await prisma.markRequest.update({
    where: { id },
    data: { status: decision, remarks, reviewedBy: req.auth!.facultyId, reviewedAt: new Date() },
  });

  logAudit(req, decision === "APPROVED" ? "APPROVE" : "REJECT", "MarkRequest", String(id), { usn: record.usn, subjectCode: record.subjectCode });

  // No in-app notification here — notify() only has a faculty recipient
  // path (see lib/notify.ts), and there's no student-facing equivalent in
  // this app. The student sees the outcome directly on their Re-Eval page,
  // where the request's status now reads APPROVED/REJECTED.

  res.json(updated);
});
