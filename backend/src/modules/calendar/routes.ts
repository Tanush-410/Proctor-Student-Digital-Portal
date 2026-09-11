import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { logAudit } from "../../lib/audit";
import { buildPtmRecordPdf } from "../reports/pdf";

export const calendarRouter = safeRouter();

/** Same read-access rule GET /ptm's list applies to one record: a student
 * may only see their own, a proctor only their own log, admin sees all. */
function canReadPtm(auth: AuthedRequest["auth"], record: { proctorId: number; usn: string | null }): boolean {
  if (auth!.role === "ADMIN") return true;
  if (auth!.role === "PROCTOR") return record.proctorId === auth!.facultyId;
  return record.usn === auth!.usn;
}

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
    include: { proctor: { select: { name: true, shortCode: true } }, student: { select: { name: true, usn: true, section: true } } },
  });
  res.json(records);
});

// GET /ptm/:id — one record's full detail, for the standalone document view
// and the PDF export. Joins in the proctor's and student's names so the
// document doesn't need a second round-trip to render "Recorded by" / who
// it's about.
calendarRouter.get("/ptm/:id", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid PTM id" });

  const record = await prisma.ptmRecord.findUnique({
    where: { ptmId: id },
    include: { proctor: { select: { name: true, shortCode: true } }, student: { select: { name: true, usn: true, section: true } } },
  });
  if (!record) return res.status(404).json({ error: "PTM record not found" });
  if (!canReadPtm(req.auth!, record)) return res.status(403).json({ error: "Not your PTM record to view" });

  res.json(record);
});

// DELETE /ptm/:id — the owning proctor or an admin only. Not the student, and
// not another proctor even if the record happens to be about their proctee
// (it's the author's own log entry).
calendarRouter.delete("/ptm/:id", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid PTM id" });

  const record = await prisma.ptmRecord.findUnique({ where: { ptmId: id } });
  if (!record) return res.status(404).json({ error: "PTM record not found" });
  if (req.auth!.role !== "ADMIN" && record.proctorId !== req.auth!.facultyId) {
    return res.status(403).json({ error: "You may only delete your own PTM records" });
  }

  await prisma.ptmRecord.delete({ where: { ptmId: id } });
  logAudit(req, "DELETE", "PtmRecord", String(id), { usn: record.usn, ptmDate: record.ptmDate });
  res.status(204).end();
});

// GET /ptm/:id/report — the same record as a downloadable PDF, with the same
// big-crest watermark treatment as every other generated report.
calendarRouter.get("/ptm/:id/report", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid PTM id" });

  const record = await prisma.ptmRecord.findUnique({
    where: { ptmId: id },
    include: { proctor: { select: { name: true, shortCode: true } }, student: { select: { name: true, usn: true } } },
  });
  if (!record) return res.status(404).json({ error: "PTM record not found" });
  if (!canReadPtm(req.auth!, record)) return res.status(403).json({ error: "Not your PTM record to download" });

  logAudit(req, "EXPORT", "PtmRecord", String(id));
  buildPtmRecordPdf(record, res);
});
