import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const auditRouter = safeRouter();

const PAGE_SIZE = 50;

// GET /admin/audit-log?targetType=&targetId=&actorId=&cursor= — Admin-only
// compliance trail, paginated (cursor = last-seen id, since createdAt alone
// isn't unique enough for a stable cursor under bulk writes).
auditRouter.get("/admin/audit-log", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const targetType = req.query.targetType as string | undefined;
  const targetId = req.query.targetId as string | undefined;
  const actorId = req.query.actorId ? parseInt(req.query.actorId as string, 10) : undefined;
  const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : undefined;

  const entries = await prisma.auditLog.findMany({
    where: {
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: PAGE_SIZE,
    include: { actor: { select: { name: true, shortCode: true } } },
  });

  res.json({ entries, nextCursor: entries.length === PAGE_SIZE ? entries[entries.length - 1].id : null });
});
