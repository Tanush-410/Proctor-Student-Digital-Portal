import multer from "multer";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { allocateStudents, normaliseKeys, parseSheet, requireEmailColumn } from "./engine";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const ingestionRouter = safeRouter();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// POST /admin/upload/class-list — upload and merge a class-list sheet.
// Columns: usn, name, email, section, proctor_short_code
ingestionRouter.post(
  "/upload/class-list",
  requireAuth,
  requireRole("ADMIN", "PROCTOR"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const { rows, errors: parseErrors } = parseSheet(req.file.buffer);
    const normalised = normaliseKeys(rows);

    // Checked against the original array (not a filtered/re-indexed copy) so
    // the reported row number always matches the row in the uploaded sheet.
    const rowErrors = normalised
      .map((r, i) => ({ r, row: i + 2 }))
      .filter(({ r }) => !r.email || !r.usn || !r.name)
      .map(({ r, row }) => ({ row, message: !r.email ? "Missing required column: email" : "Missing required column: usn or name" }));

    const validRows = normalised.filter((r) => r.email && r.usn && r.name) as any;

    const summary = await allocateStudents(
      validRows,
      [],
      [...parseErrors, ...rowErrors],
      req.auth!.facultyId!,
      "CLASS_LIST"
    );

    res.json(summary);
  }
);

// POST /admin/upload/admission-data — upload and merge an admission-detail sheet.
// Columns: email, admission_year, quota, father_name, father_phone, mother_name,
// mother_phone, local_address, local_guardian_name, local_guardian_phone
ingestionRouter.post(
  "/upload/admission-data",
  requireAuth,
  requireRole("ADMIN", "PROCTOR"),
  upload.single("file"),
  async (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "file is required" });

    const { rows, errors: parseErrors } = parseSheet(req.file.buffer);
    const normalised = normaliseKeys(rows);
    const { rows: withEmail, errors: emailErrors } = requireEmailColumn(normalised);
    const errors = [...parseErrors, ...emailErrors];

    const batch = await prisma.importBatch.create({
      data: { uploadedBy: req.auth!.facultyId!, sourceType: "ADMISSION_DATA", rowCount: withEmail.length, errorCount: 0 },
    });

    let updated = 0;
    const exceptions: { row: number; raw: Record<string, string>; reason: string }[] = [];

    for (let i = 0; i < withEmail.length; i++) {
      const row = withEmail[i];
      const student = await prisma.student.findUnique({ where: { email: row.email } });
      if (!student) {
        exceptions.push({ row: i + 2, raw: row, reason: `No class-list student found for e-mail ${row.email}` });
        continue;
      }
      await prisma.student.update({
        where: { usn: student.usn },
        data: {
          admissionYear: row.admission_year ? parseInt(row.admission_year, 10) : student.admissionYear,
          quota: row.quota || student.quota,
          fatherName: row.father_name || student.fatherName,
          fatherPhone: row.father_phone || student.fatherPhone,
          motherName: row.mother_name || student.motherName,
          motherPhone: row.mother_phone || student.motherPhone,
          localAddress: row.local_address || student.localAddress,
          localGuardianName: row.local_guardian_name || student.localGuardianName,
          localGuardianPhone: row.local_guardian_phone || student.localGuardianPhone,
        },
      });
      updated++;
    }

    if (exceptions.length > 0) {
      await prisma.importException.createMany({
        data: exceptions.map((e) => ({
          batchId: batch.batchId,
          rowNumber: e.row,
          rawData: JSON.stringify(e.raw),
          reason: e.reason,
        })),
      });
    }
    await prisma.importBatch.update({
      where: { batchId: batch.batchId },
      data: { errorCount: exceptions.length + errors.length },
    });

    res.json({ batchId: batch.batchId, updated, exceptions: exceptions.length, errors });
  }
);

// GET /admin/import-batches — traceability log (Section 5.1: IMPORT_BATCH).
ingestionRouter.get("/import-batches", requireAuth, requireRole("ADMIN", "PROCTOR"), async (_req, res) => {
  const batches = await prisma.importBatch.findMany({
    orderBy: { uploadedAt: "desc" },
    include: { uploader: { select: { name: true, shortCode: true } } },
    take: 50,
  });
  res.json(batches);
});

// GET /admin/import-exceptions — the exception queue (Figure 3).
ingestionRouter.get("/import-exceptions", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req, res) => {
  const resolved = req.query.resolved === "true";
  const exceptions = await prisma.importException.findMany({
    where: { resolved },
    orderBy: { createdAt: "desc" },
    include: { batch: { select: { sourceType: true, uploadedAt: true } } },
    take: 200,
  });
  res.json(exceptions.map((e) => ({ ...e, rawData: JSON.parse(e.rawData) })));
});

ingestionRouter.patch("/import-exceptions/:id/resolve", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await prisma.importException.update({ where: { id }, data: { resolved: true } });
  res.json(updated);
});

// POST /admin/cohort/promote — advance the cohort's current_semester.
ingestionRouter.post("/cohort/promote", requireAuth, requireRole("ADMIN"), async (req: AuthedRequest, res) => {
  const { section, maxSemester } = req.body as { section?: string; maxSemester?: number };
  const where: any = {};
  if (section) where.section = section;
  if (maxSemester) where.currentSemester = { lt: maxSemester };

  const result = await prisma.student.updateMany({
    where,
    data: { currentSemester: { increment: 1 } },
  });
  res.json({ promoted: result.count });
});
