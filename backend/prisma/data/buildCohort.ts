/**
 * Rebuilds prisma/data/cohort.json from the department source files:
 *   ~/Downloads/3rd sem Section wise class list FINAL.xlsx  (roster + proctor codes)
 *   ~/Downloads/UG-ONLINE ADMN. DETAILES-2024-25-[UG].xlsx   (admission details, by e-mail)
 *   ./resultsData.ts                                          (hand-verified 4th-sem SEE marks)
 *
 * This is exactly what was loaded into Supabase — regenerated from files so the
 * committed snapshot never requires a live DB dump. `npm run seed:real` reloads it.
 */
import fs from "fs";
import os from "os";
import path from "path";
import * as XLSX from "xlsx";
import { RESULTS, SUBJECTS, CREDITS, NOT_ON_SHEET, TAL } from "./resultsData";

const CLASS_LIST = path.join(os.homedir(), "Downloads", "3rd sem Section wise class list FINAL.xlsx");
const ADMISSION = path.join(os.homedir(), "Downloads", "UG-ONLINE ADMN. DETAILES-2024-25-[UG].xlsx");

const WANT_PROCTORS = new Set(["PN", "MVM"]);
const EMAIL_FIX: Record<string, string> = { "vibhavcs24@bmsce.ac.in": "vibhav.cs24@bmsce.ac.in" };
const clean = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" || s === "0" ? null : s;
};

// --- faculty (from the class list "Proctor" sheet + the user-supplied HOD) ---
const faculty = [
  { facultyId: 4, staffId: "ADMIN001", name: "Shuba V Rao", shortCode: "SVR", cabinNo: null, telecomNo: null, phone: null, email: "shuba.rao@bmsce.ac.in", role: "ADMIN" },
  { facultyId: 5, staffId: "FAC-PN", name: "Praveen N", shortCode: "PN", cabinNo: null, telecomNo: null, phone: "9740814006", email: "praveen.cse@bmsce.ac.in", role: "PROCTOR" },
  { facultyId: 6, staffId: "FAC-MVM", name: "Megavalli M", shortCode: "MVM", cabinNo: null, telecomNo: null, phone: "9080997197", email: "megavalli.cse@bmsce.ac.in", role: "PROCTOR" },
];
const facultyIdByCode: Record<string, number> = { PN: 5, MVM: 6 };

// --- roster (class list "Final list" sheet, header on row 5) ---
const clsWb = XLSX.read(fs.readFileSync(CLASS_LIST), { type: "buffer" });
const clsRows = XLSX.utils.sheet_to_json<string[]>(clsWb.Sheets["Final list"], { header: 1, defval: "", raw: false, blankrows: false });
const USN_RE = /^1[A-Z0-9]{2}\d{2}[A-Z]{2}\d{3}$/i;

type Student = {
  usn: string; name: string; section: string | null; admissionYear: number; currentSemester: number;
  proctorId: number | null; quota: string | null; fatherName: string | null; fatherPhone: string | null;
  motherName: string | null; motherPhone: string | null; localAddress: string | null;
  localGuardianName: string | null; localGuardianPhone: string | null; email: string;
};

let section: string | null = null;
const students: Student[] = [];
for (const r of clsRows) {
  const c1 = String(r[1] ?? "").trim();
  if (/^SECTION\b/i.test(c1)) { section = c1.replace(/^SECTION\s*/i, "").trim(); continue; }
  if (!USN_RE.test(c1)) continue;
  const code = String(r[3] ?? "").trim().toUpperCase();
  if (!WANT_PROCTORS.has(code)) continue;
  students.push({
    usn: c1.toUpperCase(),
    name: String(r[2] ?? "").trim(),
    section: section || null,
    admissionYear: 2024,
    currentSemester: 5,
    proctorId: facultyIdByCode[code],
    quota: null, fatherName: null, fatherPhone: null, motherName: null, motherPhone: null,
    localAddress: null, localGuardianName: null, localGuardianPhone: null,
    email: String(r[4] ?? "").trim().toLowerCase(),
  });
}

// --- admission details (Overall Adm. List, by e-mail) ---
const admWb = XLSX.read(fs.readFileSync(ADMISSION), { type: "buffer" });
const admRows = XLSX.utils.sheet_to_json<Record<string, string>>(admWb.Sheets["Overall Adm. List"], { defval: "", raw: false });
const admByEmail = new Map<string, Record<string, string>>();
for (const r of admRows) {
  const e = String(r["Email"] ?? "").trim().toLowerCase();
  if (e && !admByEmail.has(e)) admByEmail.set(e, r);
}
for (const s of students) {
  const key = (EMAIL_FIX[s.email] || s.email).toLowerCase();
  const r = admByEmail.get(key);
  if (!r) continue;
  s.quota = clean(r["Quota"]);
  s.fatherName = clean(r["Father Name"]);
  s.fatherPhone = clean(r["Father Phone"]);
  s.motherName = clean(r["Mother Name"]);
  s.motherPhone = clean(r["Mother Phone"]);
  s.localAddress = clean(r["Local Address"]);
  s.localGuardianName = clean(r["Guardian Name"]);
  s.localGuardianPhone = clean(r["Local Phone Number"]);
  const ay = clean(r["Admission Year"]);
  if (ay && /^\d{4}$/.test(ay)) s.admissionYear = parseInt(ay, 10);
}

// --- results (from resultsData.ts) ---
const num = (v: number | string) => (typeof v === "number" ? v : null);
const statusFor = (g: string) => (g === "F" ? "FAIL" : g === "AB" ? "ABSENT" : g === "DX" || g === "I" ? "WITHHELD" : "PASS");
const results: any[] = [];
for (const [usn, subs] of Object.entries(RESULTS)) {
  subs.forEach((cell, i) => {
    const [cie, see, tot, grade] = cell;
    results.push({
      usn, subjectCode: SUBJECTS[i].code, subjectName: SUBJECTS[i].name, semester: 4, sourceType: "MAIN",
      internalMarks: num(cie), externalMarks: num(see), totalMarks: num(tot),
      credits: CREDITS[SUBJECTS[i].code], grade: grade || null, status: statusFor(grade),
    });
  });
}

const out = {
  _generated: new Date().toISOString(),
  _note: "Real BMSCE CSE cohort (proctors PN + MVM). Rebuilt from department source files by buildCohort.ts. Loaded by `npm run seed:real`. Contains real student PII — this repo must stay private.",
  _not_on_result_sheet: NOT_ON_SHEET,
  _results_awaited_tal: TAL,
  _credits_assumed: CREDITS,
  faculty, students, results, claims: [], ptm: [],
};

const file = path.join(__dirname, "cohort.json");
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`built ${file}: ${faculty.length} faculty, ${students.length} students, ${results.length} results`);
const withAdm = students.filter((s) => s.fatherName).length;
console.log(`  admission details matched: ${withAdm}/${students.length}`);
