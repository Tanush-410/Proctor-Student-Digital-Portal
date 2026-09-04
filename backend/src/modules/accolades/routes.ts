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

export const accoladesRouter = safeRouter();

// Same whitelist as activity-point proof files — a certificate/award photo
// or a PDF scan of it.
const ALLOWED_PROOF_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const proofDir = path.join(UPLOADS_DIR, "accolades");
fs.mkdirSync(proofDir, { recursive: true });

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

function canView(auth: NonNullable<AuthedRequest["auth"]>, student: { usn: string }): boolean {
  if (auth.role === "ADMIN" || auth.role === "PROCTOR") return true; // same directory-wide read as the rest of a student's record
  return auth.role === "STUDENT" && auth.usn === student.usn;
}

// GET /uploads/accolades/:filename — serves a proof file to the owning
// student, their proctor, or an Admin only — same IDOR-safe pattern as
// activity-point proofs (opaque random filename, forced download, never a
// bare express.static mount).
accoladesRouter.get("/uploads/accolades/:filename", requireAuth, async (req: AuthedRequest, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{32}\.\w{1,5}$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const accolade = await prisma.accolade.findFirst({ where: { proofFile: `/uploads/accolades/${filename}` } });
  if (!accolade) return res.status(404).json({ error: "Not found" });

  const student = await prisma.student.findUnique({ where: { usn: accolade.usn } });
  if (!student || !canView(req.auth!, student)) return res.status(403).json({ error: "Not authorized to view this file" });

  res.setHeader("Content-Disposition", "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(proofDir, filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File missing on disk" });
  });
});

const accoladeSchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().min(1).max(2000),
  category: z.string().max(40).optional(),
});

// POST /students/:usn/accolades — a student posts their own achievement.
// Self-service only (matches activity-point claims): there's no reviewer or
// approval step here, just a notification to the student's proctor so it
// doesn't go unnoticed.
accoladesRouter.post("/students/:usn/accolades", requireAuth, requireRole("STUDENT"), upload.single("proof"), async (req: AuthedRequest, res) => {
  if (req.auth!.usn !== req.params.usn) return res.status(403).json({ error: "Students may only post their own accolades" });

  const parsed = accoladeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const accolade = await prisma.accolade.create({
    data: {
      usn: student.usn,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category || null,
      proofFile: req.file ? `/uploads/accolades/${req.file.filename}` : null,
    },
  });

  if (student.proctorId) {
    notify(student.proctorId, "ACCOLADE_POSTED", `${student.name} posted a new accolade`, `"${accolade.title}"`, `/proctor/students/${student.usn}`);
  }
  logAudit(req, "CREATE", "Accolade", String(accolade.id), { usn: student.usn });
  res.status(201).json(accolade);
});

// GET /students/:usn/accolades — same visibility rule as the rest of a
// student's record: the student themselves, any Proctor, or an Admin.
accoladesRouter.get("/students/:usn/accolades", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { usn: req.params.usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });
  if (!canView(req.auth!, student)) return res.status(403).json({ error: "Not authorized to view this student" });

  const accolades = await prisma.accolade.findMany({ where: { usn: req.params.usn }, orderBy: { createdAt: "desc" } });
  res.json(accolades);
});

// DELETE /students/:usn/accolades/:id — the student who posted it, or an Admin.
accoladesRouter.delete("/students/:usn/accolades/:id", requireAuth, requireRole("ADMIN", "STUDENT"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const accolade = await prisma.accolade.findUnique({ where: { id } });
  if (!accolade || accolade.usn !== req.params.usn) return res.status(404).json({ error: "Accolade not found" });
  if (req.auth!.role === "STUDENT" && req.auth!.usn !== accolade.usn) {
    return res.status(403).json({ error: "Students may only delete their own accolades" });
  }
  await prisma.accolade.delete({ where: { id } });
  logAudit(req, "DELETE", "Accolade", String(id), { usn: req.params.usn });
  res.json({ ok: true });
});

// GET /accolades — a feed rather than a per-student lookup: a Proctor sees
// their own proctees' accolades, an Admin sees the whole department's
// (paginated, most recent first) — the "reflect to the proctors and the HOD"
// half of the feature, so neither has to visit each student individually to
// notice a new one.
const FEED_PAGE_SIZE = 30;
accoladesRouter.get("/accolades", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;
  const where: any = cursor ? { id: { lt: cursor } } : {};

  if (req.auth!.role === "PROCTOR") {
    const proctees = await prisma.student.findMany({ where: { proctorId: req.auth!.facultyId! }, select: { usn: true } });
    where.usn = { in: proctees.map((p) => p.usn) };
  }

  const accolades = await prisma.accolade.findMany({
    where,
    orderBy: { id: "desc" },
    take: FEED_PAGE_SIZE,
    include: { student: { select: { name: true, usn: true, section: true } } },
  });

  res.json({ accolades, nextCursor: accolades.length === FEED_PAGE_SIZE ? accolades[accolades.length - 1].id : null });
});
