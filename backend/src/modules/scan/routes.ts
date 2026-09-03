import multer from "multer";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { safeRouter } from "../../lib/asyncSafeRouter";
import { InvalidFileTypeError } from "../../lib/errors";
import { extractFromPdf, NoTextLayerError, ocrImage, parseResultRows } from "./engine";
import { logAudit } from "../../lib/audit";
import { notify } from "../../lib/notify";

export const scanRouter = safeRouter();

const ALLOWED_SCAN_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_SCAN_TYPES.has(file.mimetype)) {
      return cb(new InvalidFileTypeError("Only PDF, JPEG, PNG, or WEBP files are accepted"));
    }
    cb(null, true);
  },
});

const subjectSchema = z.object({ code: z.string().min(1), name: z.string().optional(), credits: z.coerce.number().int().min(0).max(10) });
const extractFieldsSchema = z.object({
  semester: z.coerce.number().int().min(1).max(8),
  subjects: z.string().transform((s, ctx) => {
    try {
      const parsed = JSON.parse(s);
      return z.array(subjectSchema).min(1).max(12).parse(parsed);
    } catch {
      ctx.addIssue({ code: "custom", message: "subjects must be a JSON array of {code, name?, credits}" });
      return z.NEVER;
    }
  }),
});

// POST /admin/scan/extract — upload a result-sheet PDF or image; returns a
// PREVIEW of what was read, never touching the database. The caller reviews
// (and can hand-edit) the rows in the UI, then POSTs them to /commit.
scanRouter.post("/admin/scan/extract", requireAuth, requireRole("ADMIN", "PROCTOR"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });

  const parsed = extractFieldsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { semester, subjects } = parsed.data;

  let text: string;
  let ocrUsed = false;
  try {
    if (req.file.mimetype === "application/pdf") {
      const result = await extractFromPdf(req.file.buffer);
      text = result.text;
    } else {
      text = await ocrImage(req.file.buffer);
      ocrUsed = true;
    }
  } catch (err) {
    if (err instanceof NoTextLayerError) return res.status(422).json({ error: err.message });
    throw err;
  }

  const { rows, unparsedLines } = parseResultRows(text, subjects);

  const usns = rows.map((r) => r.usn);
  const students = usns.length ? await prisma.student.findMany({ where: { usn: { in: usns } } }) : [];
  const studentByUsn = new Map(students.map((s) => [s.usn, s]));

  const enrichedRows = rows.map((r) => ({
    ...r,
    studentName: studentByUsn.get(r.usn)?.name ?? null,
    matched: studentByUsn.has(r.usn),
  }));

  res.json({
    semester,
    subjects,
    ocrUsed,
    rows: enrichedRows,
    unparsedLines: unparsedLines.slice(0, 20),
    unparsedCount: unparsedLines.length,
    rawTextPreview: text.slice(0, 4000),
  });
});

const commitCellSchema = z.object({
  internalMarks: z.number().int().nullable(),
  externalMarks: z.number().int().nullable(),
  totalMarks: z.number().int().nullable(),
  grade: z.string().nullable(),
  status: z.enum(["PASS", "FAIL", "WITHHELD", "ABSENT"]),
});
const commitRowSchema = z.object({ usn: z.string().min(1), cells: z.array(commitCellSchema) });
const commitSchema = z.object({
  semester: z.number().int().min(1).max(8),
  sourceType: z.enum(["MAIN", "TAL", "REVAL", "CHALLENGE_REVAL", "SUPPLEMENTARY"]),
  subjects: z.array(subjectSchema).min(1).max(12),
  rows: z.array(commitRowSchema).min(1),
});

// POST /admin/scan/commit — the reviewed (possibly hand-corrected) rows from
// /extract, now actually written as ResultRecords. Same append-only /
// exception-queue behaviour as every other ingestion path (Section 4.2): a
// row for a student who isn't the caller's proctee, or doesn't exist, is
// routed to the exception queue rather than silently dropped or written.
scanRouter.post("/admin/scan/commit", requireAuth, requireRole("ADMIN", "PROCTOR"), async (req: AuthedRequest, res) => {
  const parsed = commitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { semester, sourceType, subjects, rows } = parsed.data;

  const batch = await prisma.importBatch.create({
    data: { uploadedBy: req.auth!.facultyId!, sourceType: `SCAN_${sourceType}`, rowCount: rows.length, errorCount: 0 },
  });

  let created = 0;
  const exceptions: { row: number; raw: Record<string, string>; reason: string }[] = [];
  const atRiskProctors = new Map<number, string[]>(); // proctorId -> usns newly showing a backlog-status cell this batch

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const student = await prisma.student.findUnique({ where: { usn: row.usn } });
    if (!student) {
      exceptions.push({ row: i + 1, raw: { usn: row.usn }, reason: `Unknown USN ${row.usn}` });
      continue;
    }
    if (req.auth!.role === "PROCTOR" && student.proctorId !== req.auth!.facultyId) {
      exceptions.push({ row: i + 1, raw: { usn: row.usn }, reason: `${row.usn} is not one of your proctees` });
      continue;
    }

    if (student.proctorId && row.cells.some((c) => c && c.status !== "PASS")) {
      const usns = atRiskProctors.get(student.proctorId) ?? [];
      usns.push(student.usn);
      atRiskProctors.set(student.proctorId, usns);
    }

    for (let s = 0; s < subjects.length; s++) {
      const cell = row.cells[s];
      const subj = subjects[s];
      if (!cell || (cell.totalMarks === null && cell.grade === null)) continue; // nothing usable for this subject (e.g. NE) — skip, not an error

      await prisma.resultRecord.create({
        data: {
          usn: row.usn,
          subjectCode: subj.code,
          subjectName: subj.name,
          semester,
          sourceType,
          internalMarks: cell.internalMarks,
          externalMarks: cell.externalMarks,
          totalMarks: cell.totalMarks,
          credits: subj.credits,
          grade: cell.grade,
          status: cell.status,
          uploadedBy: req.auth!.facultyId!,
        },
      });
      created++;
    }
  }

  if (exceptions.length > 0) {
    await prisma.importException.createMany({
      data: exceptions.map((e) => ({ batchId: batch.batchId, rowNumber: e.row, rawData: JSON.stringify(e.raw), reason: e.reason })),
    });
    const admins = await prisma.faculty.findMany({ where: { role: "ADMIN" } });
    for (const admin of admins) {
      notify(admin.facultyId, "SCAN_EXCEPTIONS", `Scan import landed ${exceptions.length} exception(s)`, `Batch #${batch.batchId} (${sourceType}) needs review.`, "/admin/exceptions");
    }
  }
  for (const [proctorId, usns] of atRiskProctors) {
    notify(proctorId, "AT_RISK", `${usns.length} proctee(s) may need attention`, `New result(s) for ${usns.join(", ")} include a non-pass status.`, "/proctor");
  }
  await prisma.importBatch.update({ where: { batchId: batch.batchId }, data: { errorCount: exceptions.length } });
  logAudit(req, "COMMIT", "ScanImportBatch", String(batch.batchId), { created, exceptions: exceptions.length, semester, sourceType });

  res.json({ batchId: batch.batchId, created, exceptions: exceptions.length });
});
