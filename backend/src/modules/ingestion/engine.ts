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

// Real department sheets never use the same header spelling twice —
// "NAME OF THE STUDENT" vs "name", "E MAIL ID" vs "email", "PROCTOR" vs
// "proctor_short_code", "Reg No" vs "usn", etc. This maps every variant
// we've actually seen (plus obvious others) to the canonical field name the
// rest of the pipeline expects, so uploads don't need to be reshaped by hand
// before every import.
const HEADER_ALIASES: Record<string, string> = {
  usn: "usn",
  "u s n": "usn",
  "usn no": "usn",
  "usn no.": "usn",
  "register number": "usn",
  "register no": "usn",
  "reg no": "usn",
  "reg no.": "usn",
  "roll no": "usn",
  "roll no.": "usn",
  "roll number": "usn",
  name: "name",
  "student name": "name",
  "students name": "name",
  "student's name": "name",
  "name of the student": "name",
  "name of student": "name",
  email: "email",
  "email id": "email",
  "e mail": "email",
  "e mail id": "email",
  "e-mail": "email",
  "e-mail id": "email",
  "mail id": "email",
  "college email": "email",
  "college email id": "email",
  section: "section",
  sec: "section",
  class: "section",
  proctor: "proctor_short_code",
  "proctor name": "proctor_short_code",
  "proctor short code": "proctor_short_code",
  proctor_short_code: "proctor_short_code",
  mentor: "proctor_short_code",
  "mentor name": "proctor_short_code",
  phone: "phone",
  "phone no": "phone",
  "phone no.": "phone",
  mobile: "phone",
  "mobile no": "phone",
  "mobile no.": "phone",
  "mobile number": "phone",
  "admission year": "admission_year",
  "year of admission": "admission_year",
  quota: "quota",
  "father name": "father_name",
  "father's name": "father_name",
  "fathers name": "father_name",
  "father phone": "father_phone",
  "father mobile": "father_phone",
  "father contact": "father_phone",
  "mother name": "mother_name",
  "mother's name": "mother_name",
  "mothers name": "mother_name",
  "mother phone": "mother_phone",
  "mother mobile": "mother_phone",
  "mother contact": "mother_phone",
  "local address": "local_address",
  address: "local_address",
  "local guardian name": "local_guardian_name",
  "guardian name": "local_guardian_name",
  "local guardian phone": "local_guardian_phone",
  "guardian phone": "local_guardian_phone",
  "subject code": "subject_code",
  "subject name": "subject_name",
  semester: "semester",
  sem: "semester",
  "source type": "source_type",
  "internal marks": "internal_marks",
  cie: "internal_marks",
  "external marks": "external_marks",
  see: "external_marks",
  "total marks": "total_marks",
  total: "total_marks",
  credit: "credits",
  grade: "grade",
  status: "status",
};

const HEADER_VALUES = new Set(Object.values(HEADER_ALIASES));

function canonicaliseHeader(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES[cleaned] ?? cleaned;
}

// Department sheets often have 2-5 title rows above the real header (college
// name, department, "5th SEM STUDENTS LIST 2026-27", a section banner, ...).
// Scan the first few rows and use whichever one has the most cells we
// recognise as a real header, instead of always assuming row 1 is it. Falls
// back to row 0 when nothing scores well, so sheets with headers we don't
// recognise at all still parse exactly as before.
function findHeaderRow(aoa: unknown[][]): number {
  const scanLimit = Math.min(aoa.length, 15);
  let bestRow = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    const row = aoa[i] ?? [];
    const score = row.filter((cell) => HEADER_VALUES.has(canonicaliseHeader(String(cell ?? "")))).length;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  return bestScore >= 2 ? bestRow : 0;
}

// Extracts data rows from one sheet's cell grid: finds the real header row
// (skipping title rows above it) and maps every row below it to canonical
// field names. Split out from parseSheet so a multi-tab workbook (e.g. one
// tab per semester, as the real department files use) can run this per tab.
function rowsFromSheet(aoa: unknown[][]): Record<string, string>[] {
  const headerRowIndex = findHeaderRow(aoa);
  const headerRow = (aoa[headerRowIndex] ?? []).map((cell) => canonicaliseHeader(String(cell ?? "")));

  const rows: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < aoa.length; i++) {
    const dataRow = aoa[i] ?? [];
    if (dataRow.every((cell) => String(cell ?? "").trim() === "")) continue; // blank separator row
    const normalised: Record<string, string> = {};
    headerRow.forEach((key, colIdx) => {
      if (!key) return;
      normalised[key] = String(dataRow[colIdx] ?? "").trim();
    });
    rows.push(normalised);
  }
  return rows;
}

/**
 * 1.0 Parse & Validate File — reads every sheet/tab in the workbook (real
 * department files are often one tab per semester/section, not a single
 * sheet), finds each tab's real header row (skipping any title rows above
 * it), and normalises header casing/spelling to canonical field names. This
 * is intentionally generic (no required columns) because it backs three
 * different upload shapes: class-list and admission-data rows key on
 * e-mail, results rows key on usn/subject_code/semester instead.
 * Column-level requirements belong to each caller — enforcing "email
 * required" here once silently broke every results upload, since that
 * sheet never has one.
 */
export function parseSheet(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const rows: Record<string, string>[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // raw: false reads the displayed text of each cell rather than SheetJS's
    // inferred JS type — otherwise phone numbers / short codes with leading
    // zeros (e.g. "0000000000") get silently parsed as numbers and truncated.
    const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    rows.push(...rowsFromSheet(aoa));
  }

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

// Strips common titles/degree prefixes so "Dr. RAJESHWARI B S" and
// "Rajeshwari B S" resolve to the same faculty row.
function normaliseProctorName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, "")
    .replace(/\s+/g, " ");
}

/**
 * 4.0 Allocate Student to Proctor — upserts each matched student and
 * resolves the proctor column to a proctor_id, by short-code first
 * ("PN") and falling back to a full-name match ("Dr. RAJESHWARI B S")
 * since department sheets use either interchangeably. Logs everything that
 * failed to join to the exception queue (Figure 3).
 *
 * `cluster`, when the caller picked one for this upload, is used two ways:
 * it's tried first when resolving a proctor (so a short code/name reused
 * across two clusters, e.g. two different "PS"s, resolves to the one the
 * uploader meant instead of whichever happens to be first in the table),
 * and it backfills onto any matched proctor that isn't tagged into a
 * cluster yet — the only way most existing proctors get tagged at all,
 * short of editing every one by hand on the Faculty page.
 */
export async function allocateStudents(
  matched: (ClassListRow & Partial<AdmissionRow>)[],
  unmatched: JoinResult["unmatched"],
  parseErrors: RowError[],
  uploadedBy: number,
  sourceLabel: string,
  cluster?: string | null
): Promise<AllocationSummary> {
  const faculty = await prisma.faculty.findMany();
  const facultyByShortCode = new Map(faculty.map((f) => [f.shortCode.trim().toLowerCase(), f]));
  const facultyByName = new Map(faculty.map((f) => [normaliseProctorName(f.name), f]));
  const facultyByShortCodeInCluster = new Map(
    faculty.filter((f) => f.cluster).map((f) => [`${f.cluster}::${f.shortCode.trim().toLowerCase()}`, f])
  );
  const facultyByNameInCluster = new Map(
    faculty.filter((f) => f.cluster).map((f) => [`${f.cluster}::${normaliseProctorName(f.name)}`, f])
  );

  function resolveProctor(proctorValue: string): (typeof faculty)[number] | undefined {
    const shortKey = proctorValue.trim().toLowerCase();
    const nameKey = normaliseProctorName(proctorValue);
    if (cluster) {
      const scoped = facultyByShortCodeInCluster.get(`${cluster}::${shortKey}`) ?? facultyByNameInCluster.get(`${cluster}::${nameKey}`);
      if (scoped) return scoped;
    }
    return facultyByShortCode.get(shortKey) ?? facultyByName.get(nameKey);
  }

  let created = 0;
  let updated = 0;
  const joinExceptions = [...unmatched];
  const clusterBackfilled = new Set<number>();

  const batch = await prisma.importBatch.create({
    data: { uploadedBy, sourceType: sourceLabel, rowCount: matched.length + unmatched.length, errorCount: 0 },
  });

  for (const row of matched) {
    const proctorValue = row.proctor_short_code?.trim();
    const proctor = proctorValue ? resolveProctor(proctorValue) : undefined;
    if (proctorValue && !proctor) {
      joinExceptions.push({ row: 0, raw: row as unknown as Record<string, string>, reason: `Unknown proctor "${row.proctor_short_code}"` });
      continue;
    }
    if (proctor && cluster && !proctor.cluster && !clusterBackfilled.has(proctor.facultyId)) {
      await prisma.faculty.update({ where: { facultyId: proctor.facultyId }, data: { cluster } });
      proctor.cluster = cluster;
      clusterBackfilled.add(proctor.facultyId);
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
