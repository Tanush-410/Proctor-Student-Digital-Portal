import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const notificationsRouter = safeRouter();

// GET /notifications — the caller's own notifications, most recent first,
// capped at 50 (a quick-glance bell dropdown, not a full inbox).
notificationsRouter.get("/notifications", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where: { recipientId: req.auth!.facultyId! }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.notification.count({ where: { recipientId: req.auth!.facultyId!, read: false } }),
  ]);
  res.json({ items, unreadCount });
});

// POST /notifications/:id/read
notificationsRouter.post("/notifications/:id/read", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  const notif = await prisma.notification.findUnique({ where: { id } });
  if (!notif || notif.recipientId !== req.auth!.facultyId) return res.status(404).json({ error: "Notification not found" });
  await prisma.notification.update({ where: { id }, data: { read: true } });
  res.json({ ok: true });
});

// POST /notifications/read-all
notificationsRouter.post("/notifications/read-all", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({ where: { recipientId: req.auth!.facultyId!, read: false }, data: { read: true } });
  res.json({ ok: true });
});
