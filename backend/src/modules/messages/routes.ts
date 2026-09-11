import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { notify } from "../../lib/notify";

export const messagesRouter = safeRouter();

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
    const existing = threads.get(otherId);
    if (!existing) {
      threads.set(otherId, { with: other, lastBody: m.body, lastAt: m.createdAt, unread: m.recipientId === me && !m.read ? 1 : 0 });
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
  recipientId: z.number().int(),
  body: z.string().trim().min(1).max(4000),
});

// POST /messages — send one message. Any Faculty member (proctor or admin)
// may message any other; there's no proctor-vs-HOD access restriction here,
// since staff messaging each other isn't the kind of student-data access
// this app otherwise locks down.
messagesRouter.post("/messages", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const me = req.auth!.facultyId!;
  if (parsed.data.recipientId === me) return res.status(400).json({ error: "Can't message yourself" });

  const recipient = await prisma.faculty.findUnique({ where: { facultyId: parsed.data.recipientId } });
  if (!recipient) return res.status(404).json({ error: "Recipient not found" });

  const message = await prisma.message.create({
    data: { senderId: me, recipientId: parsed.data.recipientId, body: parsed.data.body },
  });

  const sender = await prisma.faculty.findUnique({ where: { facultyId: me }, select: { name: true, shortCode: true } });
  const base = recipient.role === "ADMIN" ? "/admin" : "/proctor";
  notify(parsed.data.recipientId, "NEW_MESSAGE", `New message from ${sender?.name} (${sender?.shortCode})`, parsed.data.body.slice(0, 140), `${base}/messages`);

  res.status(201).json(message);
});

// GET /messages/unread-count — for the sidebar/bell badge.
messagesRouter.get("/messages/unread-count", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const count = await prisma.message.count({ where: { recipientId: req.auth!.facultyId!, read: false } });
  res.json({ count });
});
