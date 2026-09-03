import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const calendarRouter = safeRouter();

const ptmSchema = z.object({
  ptmDate: z.string().min(1),
  ptmTime: z.string().min(1),
  notes: z.string().optional(),
  usn: z.string().optional(), // optional — tag this PTM to one proctee, shown on their detail page
});

// POST /ptm — record a PTM entry, always against the caller's own proctor id.
calendarRouter.post("/ptm", requireAuth, requireRole("PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = ptmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.usn) {
    const student = await prisma.student.findUnique({ where: { usn: parsed.data.usn } });
    if (!student || student.proctorId !== req.auth!.facultyId) {
      return res.status(403).json({ error: "You may only tag a PTM to your own proctee" });
    }
  }

  const record = await prisma.ptmRecord.create({
    data: { proctorId: req.auth!.facultyId!, ...parsed.data },
  });
  res.status(201).json(record);
});

// POST /ptm/bulk — log the same PTM slot against several proctees at once
// (a batch meeting covering a whole section). Same skip-and-report shape as
// the other bulk endpoints — a usn outside the caller's proctee list is
// skipped, not enough to fail the rest of the batch.
const bulkPtmSchema = z.object({
  ptmDate: z.string().min(1),
  ptmTime: z.string().min(1),
  notes: z.string().optional(),
  usns: z.array(z.string().min(1)).min(1).max(200),
});
calendarRouter.post("/ptm/bulk", requireAuth, requireRole("PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = bulkPtmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const students = await prisma.student.findMany({ where: { usn: { in: parsed.data.usns } } });
  const studentByUsn = new Map(students.map((s) => [s.usn, s]));

  const skipped: { usn: string; reason: string }[] = [];
  const toCreate: string[] = [];
  for (const usn of parsed.data.usns) {
    const student = studentByUsn.get(usn);
    if (!student) {
      skipped.push({ usn, reason: "Unknown USN" });
      continue;
    }
    if (student.proctorId !== req.auth!.facultyId) {
      skipped.push({ usn, reason: "Not your proctee" });
      continue;
    }
    toCreate.push(usn);
  }

  if (toCreate.length > 0) {
    await prisma.ptmRecord.createMany({
      data: toCreate.map((usn) => ({ proctorId: req.auth!.facultyId!, ptmDate: parsed.data.ptmDate, ptmTime: parsed.data.ptmTime, notes: parsed.data.notes, usn })),
    });
  }
  res.status(201).json({ created: toCreate.length, skipped });
});

// GET /ptm?proctor_id=&usn= — list PTM records. Self-scoped for Proctor
// (their own log) and Student (their own PTM history — read-only, since PTM
// scheduling/notification is out of scope by design); filterable by Admin.
calendarRouter.get("/ptm", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  let proctorId: number | undefined;
  let usn: string | undefined;

  if (req.auth!.role === "STUDENT") {
    usn = req.auth!.usn!;
  } else if (req.auth!.role === "PROCTOR") {
    proctorId = req.auth!.facultyId!;
    usn = (req.query.usn as string | undefined) || undefined;
  } else {
    proctorId = req.query.proctor_id ? parseInt(req.query.proctor_id as string, 10) : undefined;
    usn = (req.query.usn as string | undefined) || undefined;
  }

  const records = await prisma.ptmRecord.findMany({
    where: { ...(proctorId ? { proctorId } : {}), ...(usn ? { usn } : {}) },
    orderBy: { ptmDate: "desc" },
  });
  res.json(records);
});
