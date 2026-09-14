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

export const messagesRouter = safeRouter();

const attachmentDir = path.join(UPLOADS_DIR, "messages");
fs.mkdirSync(attachmentDir, { recursive: true });

// Extension is taken from a fixed lookup table, never from the caller's
// filename — same reasoning as activity-point proofs (activityPoints/routes.ts):
// combined with the GET route below forcing a download instead of an inline
// render, an attachment can't execute as a page in this app's origin no
// matter what content sneaks past the MIME whitelist.
const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "application/zip": ".zip",
};
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, attachmentDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${ALLOWED_ATTACHMENT_TYPES[file.mimetype] ?? ""}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_TYPES[file.mimetype]) {
      return cb(new InvalidFileTypeError("That file type isn't supported — images, PDF, Word/Excel, .txt, or .zip only"));
    }
    cb(null, true);
  },
});

/** GET /messages/threads — every Faculty member the caller has exchanged a
 * message with, most-recent first, each with the last message's preview and
 * how many from them are unread. There's no separate Conversation table —
 * a "thread" is just every Message row where the caller is sender or
 * recipient, grouped by the other party in application code (the row count
 * per caller is small enough that this is simpler and just as fast as a
 * denormalized thread table). */
messagesRouter.get("/messages/threads", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const me = req.auth!.facultyId!;
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: me }, { recipientId: me }] },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { facultyId: true, name: true, shortCode: true, role: true } },
      recipient: { select: { facultyId: true, name: true, shortCode: true, role: true } },
    },
  });

  const threads = new Map<number, { with: { facultyId: number; name: string; shortCode: string; role: string }; lastBody: string; lastAt: Date; unread: number }>();
  for (const m of messages) {
    const otherId = m.senderId === me ? m.recipientId : m.senderId;
    const other = m.senderId === me ? m.recipient : m.sender;
    const preview = previewText(m);
    const existing = threads.get(otherId);
    if (!existing) {
      threads.set(otherId, { with: other, lastBody: preview, lastAt: m.createdAt, unread: m.recipientId === me && !m.read ? 1 : 0 });
    } else if (m.recipientId === me && !m.read) {
      existing.unread++;
    }
  }

  res.json([...threads.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime()));
});

// GET /messages/with/:facultyId — full history with one other Faculty member,
// oldest first (reading order); marks their messages to me as read.
messagesRouter.get("/messages/with/:facultyId", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const me = req.auth!.facultyId!;
  const otherId = parseInt(req.params.facultyId, 10);
  if (Number.isNaN(otherId)) return res.status(400).json({ error: "Invalid faculty id" });

  const other = await prisma.faculty.findUnique({ where: { facultyId: otherId }, select: { facultyId: true, name: true, shortCode: true, role: true } });
  if (!other) return res.status(404).json({ error: "Faculty not found" });

  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: me, recipientId: otherId }, { senderId: otherId, recipientId: me }] },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({ where: { senderId: otherId, recipientId: me, read: false }, data: { read: true } });

  res.json({ with: other, messages });
});

const sendSchema = z.object({
  recipientId: z.coerce.number().int(),
  body: z.string().trim().max(4000).optional(),
});

// POST /messages — send one message: caption text, an attachment, or both
// (an attachment-only message, like a plain photo share, is allowed — see
// the schema model). Any Faculty member (proctor or admin) may message any
// other; there's no proctor-vs-HOD access restriction here, since staff
// messaging each other isn't the kind of student-data access this app
// otherwise locks down. A student session can never reach this route at all
// (requireRole below), so nothing here is ever student-facing.
messagesRouter.post("/messages", requireAuth, requireRole("ADMIN", "PROCTOR"), upload.single("attachment"), async (req: AuthedRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const body = parsed.data.body?.trim() || undefined;
  if (!body && !req.file) return res.status(400).json({ error: "Message needs text, an attachment, or both" });

  const me = req.auth!.facultyId!;
  if (parsed.data.recipientId === me) return res.status(400).json({ error: "Can't message yourself" });

  const recipient = await prisma.faculty.findUnique({ where: { facultyId: parsed.data.recipientId } });
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });

  const message = await prisma.message.create({
    data: {
      senderId: me,
      recipientId: parsed.data.recipientId,
      body: body ?? null,
      attachmentUrl: req.file ? `/uploads/messages/${req.file.filename}` : null,
      attachmentName: req.file ? req.file.originalname : null,
      attachmentType: req.file ? req.file.mimetype : null,
      attachmentSize: req.file ? req.file.size : null,
    },
  });

  const sender = await prisma.faculty.findUnique({ where: { facultyId: me }, select: { name: true, shortCode: true } });
  const base = recipient.role === "ADMIN" ? "/admin" : "/proctor";
  notify(parsed.data.recipientId, "NEW_MESSAGE", `New message from ${sender?.name} (${sender?.shortCode})`, previewText(message), `${base}/messages`);

  res.status(201).json(message);
});

// GET /messages/uploads/:filename — serves a message attachment, but only to
// the sender or recipient of the message it belongs to (same pattern as
// activity-point proof files: activityPoints/routes.ts). Forced to download
// rather than render inline, regardless of what content type sneaks past the
// upload-time whitelist.
messagesRouter.get("/messages/uploads/:filename", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const { filename } = req.params;
  if (!/^[a-f0-9]{32}\.\w{1,5}$/i.test(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const message = await prisma.message.findFirst({ where: { attachmentUrl: `/uploads/messages/${filename}` } });
  if (!message) return res.status(404).json({ error: "Not found" });

  const me = req.auth!.facultyId!;
  if (message.senderId !== me && message.recipientId !== me) {
    return res.status(403).json({ error: "Not authorized to view this file" });
  }

  // Images render inline (so the chat bubble can show a thumbnail); every
  // other type forces a download — inline rendering is what the nosniff +
  // whitelist combination is specifically there to prevent for non-image
  // types (see activityPoints/routes.ts's note on this).
  const inline = message.attachmentType ? IMAGE_TYPES.has(message.attachmentType) : false;
  res.setHeader("Content-Disposition", inline ? "inline" : "attachment");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(attachmentDir, filename), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "File missing on disk" });
  });
});

// GET /messages/unread-count — for the sidebar/bell badge.
messagesRouter.get("/messages/unread-count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const count = await prisma.message.count({ where: { recipientId: req.auth!.facultyId!, read: false } });
  res.json({ count });
});

function previewText(m: { body: string | null; attachmentType: string | null; attachmentName: string | null }): string {
  if (m.body) return m.body;
  if (m.attachmentType && IMAGE_TYPES.has(m.attachmentType)) return "📷 Photo";
  return `📎 ${m.attachmentName ?? "Attachment"}`;
}
