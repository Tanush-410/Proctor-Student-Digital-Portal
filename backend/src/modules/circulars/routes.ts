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
import { buildCircularPdf } from "../reports/pdf";

export const circularsRouter = safeRouter();

const circularDir = path.join(UPLOADS_DIR, "circulars");
fs.mkdirSync(circularDir, { recursive: true });

const ALLOWED_CIRCULAR_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, circularDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${ALLOWED_CIRCULAR_TYPES[file.mimetype] ?? ""}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_CIRCULAR_TYPES[file.mimetype]) return cb(new InvalidFileTypeError("Only a PDF or Word (.doc/.docx) file is accepted"));
    cb(null, true);
  },
});

async function canAccessCircular(auth: AuthedRequest["auth"], circularId: number): Promise<boolean> {
  if (auth!.role === "ADMIN") return true;
  if (auth!.role !== "PROCTOR") return false;
  const recipient = await prisma.circularRecipient.findUnique({ where: { circularId_facultyId: { circularId, facultyId: auth!.facultyId! } } });
  return recipient !== null;
}

// GET /circulars/uploads/:filename — an uploaded PDF/Word circular file.
// Same forced-download pattern as every other upload in this app; not
// watermarked (unlike the inline-composed PDF route below) — there's no
// general way to stamp a crest onto an arbitrary uploaded Word document, and
// re-stamping an uploaded PDF was judged not worth the extra dependency for
// how rarely "upload" (vs. write in the editor) will actually be used.
circularsRouter.get("/circulars/uploads/:filename", requireAuth, async (req: AuthedRequest, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{32}\.\w{1,5}$/i.test(filename)) return res.status(400).json({ error: "Invalid filename" });

  const circular = await prisma.circular.findFirst({ where: { fileUrl: `/circulars/uploads/${filename}` } });
  if (!circular) return res.status(404).json({ error: "Not found" });
  if (!(await canAccessCircular(req.auth, circular.id))) return res.status(403).json({ error: "Not authorized to view this file" });

  res.setHeader("Content-Disposition", `attachment; filename="${circular.fileName ?? filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(circularDir, filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File missing on disk" });
  });
});

const sendSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().optional(),
  recipientIds: z
    .string()
    .transform((s) => s.split(",").map((v) => parseInt(v.trim(), 10)).filter((n) => !Number.isNaN(n)))
    .pipe(z.array(z.number().int()).min(1)),
});

// POST /circulars — HOD composes a circular (rich-text body, or an uploaded
// PDF/Word file — mutually exclusive in the UI) and sends it to selected
// recipients. Fields arrive as multipart/form-data since a file may be
// attached; recipientIds is a comma-separated list of facultyIds.
circularsRouter.post("/circulars", requireAuth, requireRole("ADMIN"), upload.single("file"), async (req: AuthedRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const hasBody = parsed.data.body && parsed.data.body.replace(/<[^>]*>/g, "").trim().length > 0;
  if (!req.file && !hasBody) return res.status(400).json({ error: "Write a circular body or upload a file" });

  const recipients = await prisma.faculty.findMany({ where: { facultyId: { in: parsed.data.recipientIds } } });
  if (recipients.length === 0) return res.status(400).json({ error: "No valid recipients" });

  const circular = await prisma.circular.create({
    data: {
      title: parsed.data.title,
      body: req.file ? null : parsed.data.body,
      fileUrl: req.file ? `/circulars/uploads/${req.file.filename}` : null,
      fileName: req.file ? req.file.originalname : null,
      senderId: req.auth!.facultyId!,
      recipients: { createMany: { data: recipients.map((r) => ({ facultyId: r.facultyId })) } },
    },
  });

  const sender = await prisma.faculty.findUnique({ where: { facultyId: req.auth!.facultyId! }, select: { name: true, shortCode: true } });
  for (const r of recipients) {
    const base = r.role === "ADMIN" ? "/admin" : "/proctor";
    notify(r.facultyId, "CIRCULAR", `New circular: ${parsed.data.title}`, `From ${sender?.name} (${sender?.shortCode})`, `${base}/circulars`);
  }

  logAudit(req, "CREATE", "Circular", String(circular.id), { title: parsed.data.title, recipientCount: recipients.length });
  res.status(201).json(circular);
});

// GET /circulars — Admin sees every circular sent (dept-wide visibility,
// same as audit log / directory); a Proctor sees only ones addressed to them.
circularsRouter.get("/circulars", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  if (req.auth!.role === "ADMIN") {
    const circulars = await prisma.circular.findMany({
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { name: true, shortCode: true } }, recipients: { select: { read: true } } },
      take: 200,
    });
    return res.json(
      circulars.map((c) => ({
        id: c.id,
        title: c.title,
        hasBody: !!c.body,
        fileName: c.fileName,
        createdAt: c.createdAt,
        sender: c.sender,
        recipientCount: c.recipients.length,
        readCount: c.recipients.filter((r) => r.read).length,
      }))
    );
  }

  const received = await prisma.circularRecipient.findMany({
    where: { facultyId: req.auth!.facultyId! },
    orderBy: { circular: { createdAt: "desc" } },
    include: { circular: { include: { sender: { select: { name: true, shortCode: true } } } } },
  });
  res.json(
    received.map((r) => ({
      id: r.circular.id,
      title: r.circular.title,
      hasBody: !!r.circular.body,
      fileName: r.circular.fileName,
      createdAt: r.circular.createdAt,
      sender: r.circular.sender,
      read: r.read,
    }))
  );
});

// GET /circulars/:id — full detail; marks read for a proctor recipient.
circularsRouter.get("/circulars/:id", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid circular id" });

  const circular = await prisma.circular.findUnique({
    where: { id },
    include: {
      sender: { select: { name: true, shortCode: true } },
      recipients: { include: { faculty: { select: { facultyId: true, name: true, shortCode: true } } } },
    },
  });
  if (!circular) return res.status(404).json({ error: "Circular not found" });
  if (!(await canAccessCircular(req.auth, id))) return res.status(403).json({ error: "Not authorized" });

  if (req.auth!.role === "PROCTOR") {
    await prisma.circularRecipient.updateMany({
      where: { circularId: id, facultyId: req.auth!.facultyId!, read: false },
      data: { read: true, readAt: new Date() },
    });
  }

  res.json(circular);
});

// GET /circulars/:id/pdf — the inline-authored body, rendered as a
// watermarked PDF on demand (same treatment as a PTM record).
circularsRouter.get("/circulars/:id/pdf", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid circular id" });

  const circular = await prisma.circular.findUnique({
    where: { id },
    include: { sender: { select: { name: true, shortCode: true } }, recipients: true },
  });
  if (!circular) return res.status(404).json({ error: "Circular not found" });
  if (!(await canAccessCircular(req.auth, id))) return res.status(403).json({ error: "Not authorized" });
  if (!circular.body) return res.status(400).json({ error: "This circular was sent as an uploaded file, not written text — use the file download instead" });

  logAudit(req, "EXPORT", "Circular", String(id));
  buildCircularPdf({ id: circular.id, title: circular.title, body: circular.body, createdAt: circular.createdAt, sender: circular.sender, recipientCount: circular.recipients.length }, res);
});
