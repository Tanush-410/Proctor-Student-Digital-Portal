import multer from "multer";
import { z } from "zod";
import { prisma } from "../../db";
import { AuthedRequest, requireAuth, requireRole } from "../../middleware/session";
import { parseSheet, normaliseKeys } from "../ingestion/engine";
import { computeCGPA, computeSGPA, getBacklogSubjects, gradeToPoint, resolvePrecedence, SourceType } from "./engine";
import { computeAcademicStatus } from "./academicStatus";
import { safeRouter } from "../../lib/asyncSafeRouter";

export const resultsRouter = safeRouter();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const VALID_SOURCE_TYPES: SourceType[] = ["MAIN", "TAL", "REVAL", "CHALLENGE_REVAL", "SUPPLEMENTARY"];

async function assertCanRead(req: AuthedRequest, usn: string, res: any): Promise<boolean> {
  if (req.auth!.role === "STUDENT" && req.auth!.usn !== usn) {
    res.status(403).json({ error: "Students may only view their own results" });
    return false;
  }
  return true;
}

// POST /results/upload — upload an official result sheet (source_type param).
// Columns: usn, subject_code, subject_name, semester, internal_marks,
// external_marks, total_marks, credits, grade, status
resultsRouter.post("/results/upload", requireAuth, requireRole("ADMIN", "PROCTOR"), upload.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const sourceType = String(req.body.source_type || "").toUpperCase() as SourceType;
  if (!VALID_SOURCE_TYPES.includes(sourceType)) {
    return res.status(400).json({ error: `source_type must be one of ${VALID_SOURCE_TYPES.join(", ")}` });
  }

  const { rows, errors } = parseSheet(req.file.buffer);
  const normalised = normaliseKeys(rows);

  const batch = await prisma.importBatch.create({
    data: { uploadedBy: req.auth!.facultyId!, sourceType: `RESULTS_${sourceType}`, rowCount: normalised.length, errorCount: 0 },
  });

  let created = 0;
  const exceptions: { row: number; raw: Record<string, string>; reason: string }[] = [];

  for (let i = 0; i < normalised.length; i++) {
    const row = normalised[i];
    if (!row.usn || !row.subject_code || !row.semester) {
      exceptions.push({ row: i + 2, raw: row, reason: "Missing usn, subject_code, or semester" });
      continue;
    }
    const student = await prisma.student.findUnique({ where: { usn: row.usn } });
    if (!student) {
      exceptions.push({ row: i + 2, raw: row, reason: `Unknown USN ${row.usn}` });
      continue;
    }
    if (req.auth!.role === "PROCTOR" && student.proctorId !== req.auth!.facultyId) {
      exceptions.push({ row: i + 2, raw: row, reason: `${row.usn} is not one of your proctees` });
      continue;
    }

    await prisma.resultRecord.create({
      data: {
        usn: row.usn,
        subjectCode: row.subject_code,
        subjectName: row.subject_name || null,
        semester: parseInt(row.semester, 10),
        sourceType,
        internalMarks: row.internal_marks ? parseInt(row.internal_marks, 10) : null,
        externalMarks: row.external_marks ? parseInt(row.external_marks, 10) : null,
        totalMarks: row.total_marks ? parseInt(row.total_marks, 10) : null,
        credits: row.credits ? parseInt(row.credits, 10) : 0,
        grade: row.grade || null,
        status: (row.status?.toUpperCase() as any) || "PASS",
        uploadedBy: req.auth!.facultyId!,
      },
    });
    created++;
  }

  if (exceptions.length > 0) {
    await prisma.importException.createMany({
      data: exceptions.map((e) => ({ batchId: batch.batchId, rowNumber: e.row, rawData: JSON.stringify(e.raw), reason: e.reason })),
    });
  }
  await prisma.importBatch.update({ where: { batchId: batch.batchId }, data: { errorCount: exceptions.length + errors.length } });

  res.json({ batchId: batch.batchId, created, exceptions: exceptions.length, errors });
});

// GET /students/:usn/results/effective — effective (precedence-resolved) results.
resultsRouter.get("/students/:usn/results/effective", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (!(await assertCanRead(req, usn, res))) return;

  const student = await prisma.student.findUnique({ where: { usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const records = await prisma.resultRecord.findMany({ where: { usn } });
  const effective = resolvePrecedence(records);
  const semesters = [...new Set(effective.map((r) => r.semester))].sort((a, b) => a - b);
  const sgpaBySemester = Object.fromEntries(semesters.map((s) => [s, computeSGPA(effective, s)]));

  res.json({
    usn,
    results: effective.map((r) => ({
      subjectCode: r.subjectCode,
      semester: r.semester,
      effective: r.effective,
      gradePoint: gradeToPoint(r.effective.grade),
      discrepancy: r.discrepancy,
      recordCount: r.allRecords.length,
    })),
    sgpaBySemester,
    cgpa: computeCGPA(effective),
    backlogSubjects: getBacklogSubjects(effective).map((r) => ({ subjectCode: r.subjectCode, semester: r.semester })),
  });
});

// GET /students/:usn/academic-status — what the student needs to do next
// (backlogs, make-up-eligible grades, CGPA probation, 7th-semester
// eligibility), computed from BMSCE's published Academic Rules & Regulations.
resultsRouter.get("/students/:usn/academic-status", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (!(await assertCanRead(req, usn, res))) return;

  const student = await prisma.student.findUnique({ where: { usn } });
  if (!student) return res.status(404).json({ error: "Student not found" });

  const records = await prisma.resultRecord.findMany({ where: { usn } });
  const effective = resolvePrecedence(records);
  const cgpa = computeCGPA(effective);

  res.json(computeAcademicStatus(effective, cgpa, student.currentSemester));
});

// GET /students/:usn/results — raw append-only history (all source records), for audit views.
resultsRouter.get("/students/:usn/results", requireAuth, requireRole("ADMIN", "PROCTOR", "STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (!(await assertCanRead(req, usn, res))) return;
  const records = await prisma.resultRecord.findMany({ where: { usn }, orderBy: [{ semester: "asc" }, { uploadedAt: "asc" }] });
  res.json(records);
});

const selfEntrySchema = z.object({
  subjectCode: z.string().min(1),
  subjectName: z.string().optional(),
  semester: z.number().int().positive(),
  internalMarks: z.number().int().optional(),
  externalMarks: z.number().int().optional(),
  totalMarks: z.number().int().optional(),
  credits: z.number().int().optional(),
  grade: z.string().optional(),
  status: z.enum(["PASS", "FAIL", "WITHHELD", "ABSENT"]).optional(),
});

// POST /students/:usn/results/self-entry — submit a provisional result / internal marks.
resultsRouter.post("/students/:usn/results/self-entry", requireAuth, requireRole("STUDENT"), async (req: AuthedRequest, res) => {
  const { usn } = req.params;
  if (req.auth!.usn !== usn) return res.status(403).json({ error: "Students may only submit their own provisional results" });

  const parsed = selfEntrySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const body = parsed.data;

  const record = await prisma.resultRecord.create({
    data: {
      usn,
      subjectCode: body.subjectCode,
      subjectName: body.subjectName,
      semester: body.semester,
      sourceType: "STUDENT_PROVISIONAL",
      internalMarks: body.internalMarks,
      externalMarks: body.externalMarks,
      totalMarks: body.totalMarks,
      credits: body.credits ?? 0,
      grade: body.grade,
      status: body.status ?? "PASS",
    },
  });
  res.status(201).json(record);
});
