import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const calendarRouter = safeRouter();

const ptmSchema = z.object({
  ptmDate: z.string().min(1),
  ptmTime: z.string().min(1),
  notes: z.string().optional(),
});

// POST /ptm — record a PTM entry, always against the caller's own proctor id.
calendarRouter.post("/ptm", requireAuth, requireRole("PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = ptmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const record = await prisma.ptmRecord.create({
    data: { proctorId: req.auth!.facultyId!, ...parsed.data },
  });
  res.status(201).json(record);
});

// GET /ptm?proctor_id= — list a proctor's PTM records (self-scoped for Proctor role, filterable for Admin).
calendarRouter.get("/ptm", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const proctorId = req.auth!.role === "PROCTOR" ? req.auth!.facultyId! : req.query.proctor_id ? parseInt(req.query.proctor_id as string, 10) : undefined;
  const records = await prisma.ptmRecord.findMany({
    where: proctorId ? { proctorId } : undefined,
    orderBy: { ptmDate: "desc" },
  });
  res.json(records);
});
