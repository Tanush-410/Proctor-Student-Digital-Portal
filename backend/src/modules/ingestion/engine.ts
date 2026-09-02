import * as XLSX from "xlsx";
import { prisma } from "../../db";

export interface RowError {
  row: number;
  message: string;
}

export interface ParsedSheet {
  rows: Record<string, string>[];
  errors: RowError[];
}

/**
 * 1.0 Parse & Validate File — reads the sheet and normalises header casing.
 * This is intentionally generic (no required columns) because it backs three
 * different upload shapes: class-list and admission-data rows key on e-mail,
 * results rows key on usn/subject_code/semester instead. Column-level
 * requirements belong to each caller — enforcing "email required" here once
 * silently broke every results upload, since that sheet never has one.
 */
export function parseSheet(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // raw: false reads the displayed text of each cell rather than SheetJS's
  // inferred JS type — otherwise phone numbers / short codes with leading
  // zeros (e.g. "0000000000") get silently parsed as numbers and truncated.
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

  const rows: Record<string, string>[] = raw.map((r) => {
    const normalised: Record<string, string> = {};
    for (const [key, value] of Object.entries(r)) {
      normalised[key.trim().toLowerCase()] = String(value).trim();
    }
    return normalised;
  });

  return { rows, errors: [] };
}

/** Row-level check for the two upload flows that key on e-mail (class-list, admission-data). */
export function requireEmailColumn(rows: Record<string, string>[]): { rows: Record<string, string>[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const kept: Record<string, string>[] = [];
  rows.forEach((row, idx) => {
    if (!row.email) {
      errors.push({ row: idx + 2, message: "Missing required column: email" });
      return;
    }
    kept.push(row);
  });
  return { rows: kept, errors };
}

/** 2.0 Normalise Keys — trims short codes, lower-cases e-mail addresses. */
export function normaliseKeys(rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const out = { ...row };
    if (out.email) out.email = out.email.trim().toLowerCase();
    if (out.proctor_short_code) out.proctor_short_code = out.proctor_short_code.trim();
    if (out.usn) out.usn = out.usn.trim().toUpperCase();
    return out;
  });
}

export type ClassListRow = {
  usn: string;
  name: string;
  email: string;
  section?: string;
  proctor_short_code?: string;
};

export type AdmissionRow = {
  email: string;
  admission_year?: string;
  quota?: string;
  father_name?: string;
  father_phone?: string;
  mother_name?: string;
  mother_phone?: string;
  local_address?: string;
  local_guardian_name?: string;
  local_guardian_phone?: string;
};

export interface JoinResult {
  matched: (ClassListRow & Partial<AdmissionRow>)[];
  unmatched: { row: number; raw: Record<string, string>; reason: string }[];
}

/**
 * 3.0 Join Class-List & Admission Records on E-mail — the two spreadsheet
 * sources share no reliable common key except e-mail (Section 4.2). Rows that
 * fail to join are returned separately rather than dropped.
 */
export function joinOnEmail(
  classList: Record<string, string>[],
  admissionData: Record<string, string>[]
): JoinResult {
  const admissionByEmail = new Map(admissionData.map((r) => [r.email, r]));
  const matched: (ClassListRow & Partial<AdmissionRow>)[] = [];
  const unmatched: JoinResult["unmatched"] = [];

  classList.forEach((row, idx) => {
    if (!row.usn || !row.name) {
      unmatched.push({ row: idx + 2, raw: row, reason: "Missing usn or name in class list" });
      return;
    }
    const admission = admissionByEmail.get(row.email);
    if (!admission) {
      unmatched.push({ row: idx + 2, raw: row, reason: `No admission-data row for e-mail ${row.email}` });
      return;
    }
    matched.push({ ...row, ...admission } as ClassListRow & Partial<AdmissionRow>);
  });

  return { matched, unmatched };
}

export interface AllocationSummary {
  batchId: number;
  created: number;
  updated: number;
  exceptions: number;
  errors: RowError[];
}

/**
 * 4.0 Allocate Student to Proctor (by short-code) — upserts each matched
 * student, resolves proctor_short_code -> proctor_id, and logs everything
 * that failed to join to the exception queue (Figure 3).
 */
export async function allocateStudents(
  matched: (ClassListRow & Partial<AdmissionRow>)[],
  unmatched: JoinResult["unmatched"],
  parseErrors: RowError[],
  uploadedBy: number,
  sourceLabel: string
): Promise<AllocationSummary> {
  const faculty = await prisma.faculty.findMany();
  const facultyByShortCode = new Map(faculty.map((f) => [f.shortCode.trim().toLowerCase(), f]));

  let created = 0;
  let updated = 0;
  const joinExceptions = [...unmatched];

  const batch = await prisma.importBatch.create({
    data: { uploadedBy, sourceType: sourceLabel, rowCount: matched.length + unmatched.length, errorCount: 0 },
  });

  for (const row of matched) {
    const shortCode = row.proctor_short_code?.trim().toLowerCase();
    const proctor = shortCode ? facultyByShortCode.get(shortCode) : undefined;
    if (shortCode && !proctor) {
      joinExceptions.push({ row: 0, raw: row as unknown as Record<string, string>, reason: `Unknown proctor short-code "${row.proctor_short_code}"` });
      continue;
    }

    const existing = await prisma.student.findUnique({ where: { usn: row.usn } });
    const data = {
      name: row.name,
      email: row.email,
      section: row.section || existing?.section || null,
      admissionYear: row.admission_year ? parseInt(row.admission_year, 10) : existing?.admissionYear ?? new Date().getFullYear(),
      proctorId: proctor ? proctor.facultyId : existing?.proctorId ?? null,
      quota: row.quota ?? existing?.quota ?? null,
      fatherName: row.father_name ?? existing?.fatherName ?? null,
      fatherPhone: row.father_phone ?? existing?.fatherPhone ?? null,
      motherName: row.mother_name ?? existing?.motherName ?? null,
      motherPhone: row.mother_phone ?? existing?.motherPhone ?? null,
      localAddress: row.local_address ?? existing?.localAddress ?? null,
      localGuardianName: row.local_guardian_name ?? existing?.localGuardianName ?? null,
      localGuardianPhone: row.local_guardian_phone ?? existing?.localGuardianPhone ?? null,
    };

    if (existing) {
      await prisma.student.update({ where: { usn: row.usn }, data });
      updated++;
    } else {
      await prisma.student.create({ data: { usn: row.usn, currentSemester: 1, ...data } });
      created++;
    }
  }

  if (joinExceptions.length > 0) {
    await prisma.importException.createMany({
      data: joinExceptions.map((e) => ({
        batchId: batch.batchId,
        rowNumber: e.row,
        rawData: JSON.stringify(e.raw),
        reason: e.reason,
      })),
    });
  }

  await prisma.importBatch.update({
    where: { batchId: batch.batchId },
    data: { errorCount: joinExceptions.length + parseErrors.length },
  });

  return { batchId: batch.batchId, created, updated, exceptions: joinExceptions.length, errors: parseErrors };
}
