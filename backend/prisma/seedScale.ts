/**
 * Large-scale realistic seed: ~100 faculty (a handful of Admins, the rest
 * Proctors) and 3000 students spread across four admission cohorts, each
 * with a full result history for every semester from admission through
 * their current one — not just their latest semester. Meant for testing the
 * app at the scale it's actually built for, not for the small hand-authored
 * demo in prisma/seed.ts (which stays untouched for quick/simple demos).
 *
 * Deterministic (faker.seed) — re-running this produces the same dataset,
 * so the "known accounts" printed at the end are reliable across reseeds.
 */
import { faker } from "@faker-js/faker";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
faker.seed(42);

const DOMAIN = "bmsce.ac.in";
const TOTAL_FACULTY = 100;
const ADMIN_COUNT = 5;
const TOTAL_STUDENTS = 3000;

// Four cohorts, 750 each, spanning the full 4-year programme at different points.
const COHORTS: { admissionYear: number; currentSemester: number }[] = [
  { admissionYear: 2022, currentSemester: 7 },
  { admissionYear: 2023, currentSemester: 5 },
  { admissionYear: 2024, currentSemester: 3 },
  { admissionYear: 2025, currentSemester: 1 },
];
const STUDENTS_PER_COHORT = TOTAL_STUDENTS / COHORTS.length;
const SECTIONS = ["A", "B", "C", "D"];

interface Subject {
  code: string;
  name: string;
  credits: number;
}
const CURRICULUM: Record<number, Subject[]> = {
  1: [
    { code: "CS11", name: "Engineering Mathematics I", credits: 4 },
    { code: "CS12", name: "Engineering Physics", credits: 4 },
    { code: "CS13", name: "Basic Electrical Engineering", credits: 3 },
    { code: "CS14", name: "Programming in C", credits: 4 },
    { code: "CS15", name: "Engineering Graphics", credits: 3 },
    { code: "CS16", name: "Communicative English", credits: 3 },
  ],
  2: [
    { code: "CS21", name: "Engineering Mathematics II", credits: 4 },
    { code: "CS22", name: "Engineering Chemistry", credits: 4 },
    { code: "CS23", name: "Basic Electronics", credits: 3 },
    { code: "CS24", name: "Data Structures", credits: 4 },
    { code: "CS25", name: "Object Oriented Programming with Java", credits: 3 },
    { code: "CS26", name: "Environmental Studies", credits: 3 },
  ],
  3: [
    { code: "CS31", name: "Discrete Mathematical Structures", credits: 4 },
    { code: "CS32", name: "Computer Organization", credits: 4 },
    { code: "CS33", name: "Data Structures & Algorithms", credits: 4 },
    { code: "CS34", name: "Digital Design", credits: 3 },
    { code: "CS35", name: "OOP Concepts", credits: 3 },
    { code: "CS36", name: "Unix & Shell Programming", credits: 3 },
  ],
  4: [
    { code: "CS41", name: "Design & Analysis of Algorithms", credits: 4 },
    { code: "CS42", name: "Operating Systems", credits: 4 },
    { code: "CS43", name: "Database Management Systems", credits: 4 },
    { code: "CS44", name: "Microprocessors", credits: 3 },
    { code: "CS45", name: "Object Oriented Modeling & Design", credits: 3 },
    { code: "CS46", name: "Software Engineering Principles", credits: 3 },
  ],
  5: [
    { code: "CS51", name: "Software Engineering", credits: 4 },
    { code: "CS52", name: "Computer Networks", credits: 4 },
    { code: "CS53", name: "Automata Theory", credits: 3 },
    { code: "CS54", name: "Machine Learning", credits: 4 },
    { code: "CS55", name: "Web Programming", credits: 3 },
    { code: "CS56", name: "Management & Entrepreneurship", credits: 3 },
  ],
  6: [
    { code: "CS61", name: "Cloud Computing", credits: 4 },
    { code: "CS62", name: "Compiler Design", credits: 4 },
    { code: "CS63", name: "Artificial Intelligence", credits: 4 },
    { code: "CS64", name: "Data Mining & Warehousing", credits: 3 },
    { code: "CS65", name: "Distributed Systems", credits: 3 },
    { code: "CS66", name: "Cryptography & Network Security", credits: 3 },
  ],
  7: [
    { code: "CS71", name: "Big Data Analytics", credits: 4 },
    { code: "CS72", name: "Deep Learning", credits: 4 },
    { code: "CS73", name: "Mobile Application Development", credits: 3 },
    { code: "CS74", name: "Professional Elective I", credits: 3 },
    { code: "CS75", name: "Open Elective I", credits: 3 },
    { code: "CS76", name: "Project Work Phase I", credits: 2 },
  ],
  8: [
    { code: "CS81", name: "Professional Elective II", credits: 3 },
    { code: "CS82", name: "Open Elective II", credits: 3 },
    { code: "CS83", name: "Internship", credits: 2 },
    { code: "CS84", name: "Project Work Phase II", credits: 6 },
    { code: "CS85", name: "Technical Seminar", credits: 2 },
    { code: "CS86", name: "Professional Ethics", credits: 2 },
  ],
};

function marksToGrade(total: number): { grade: string; status: "PASS" | "FAIL" } {
  if (total >= 90) return { grade: "O", status: "PASS" };
  if (total >= 80) return { grade: "A+", status: "PASS" };
  if (total >= 70) return { grade: "A", status: "PASS" };
  if (total >= 60) return { grade: "B+", status: "PASS" };
  if (total >= 50) return { grade: "B", status: "PASS" };
  if (total >= 45) return { grade: "C", status: "PASS" };
  if (total >= 40) return { grade: "P", status: "PASS" };
  return { grade: "F", status: "FAIL" };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log(`Seeding ~${TOTAL_FACULTY} faculty and ${TOTAL_STUDENTS} students with full semester history...`);
  const startedAt = Date.now();

  console.log("Clearing existing data...");
  await prisma.importException.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.activityPointClaim.deleteMany();
  await prisma.ptmRecord.deleteMany();
  await prisma.resultRecord.deleteMany();
  await prisma.student.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.faculty.deleteMany();

  // --- Faculty (100): a handful of Admins, the rest Proctors. Sequential
  // creates (not createMany) because we need real facultyId values back to
  // assign as students' proctorId — only 100 rows, so this is fast regardless.
  console.log("Creating faculty...");
  const usedEmails = new Set<string>();
  const usedShortCodes = new Set<string>();

  function uniqueEmail(name: string): string {
    const base = name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".");
    let email = `${base}@${DOMAIN}`;
    let n = 1;
    while (usedEmails.has(email)) email = `${base}${n++}@${DOMAIN}`;
    usedEmails.add(email);
    return email;
  }
  function uniqueShortCode(name: string): string {
    const initials = name.replace(/^(Dr\.|Prof\.)\s*/, "").split(/\s+/).map((p) => p[0]).join("").toUpperCase();
    let code = initials.slice(0, 3);
    let n = 1;
    while (usedShortCodes.has(code)) code = `${initials.slice(0, 2)}${n++}`;
    usedShortCodes.add(code);
    return code;
  }

  const KNOWN_ADMIN = { name: "Dr. Ramesh Iyer", email: "hod.cse@bmsce.ac.in", shortCode: "RI" };
  const KNOWN_PROCTORS = [
    { name: "Prof. Anjali Rao", email: "anjali.rao@bmsce.ac.in", shortCode: "AR" },
    { name: "Prof. Sunil Kumar", email: "sunil.kumar@bmsce.ac.in", shortCode: "SK" },
  ];
  usedEmails.add(KNOWN_ADMIN.email);
  usedShortCodes.add(KNOWN_ADMIN.shortCode);
  KNOWN_PROCTORS.forEach((p) => {
    usedEmails.add(p.email);
    usedShortCodes.add(p.shortCode);
  });

  const facultyIds: { admin: number[]; proctor: number[] } = { admin: [], proctor: [] };

  const adminHod = await prisma.faculty.create({
    data: {
      staffId: "STF001",
      name: KNOWN_ADMIN.name,
      shortCode: KNOWN_ADMIN.shortCode,
      email: KNOWN_ADMIN.email,
      role: "ADMIN",
      cabinNo: "CSE-201",
      telecomNo: "2201",
      phone: faker.phone.number({ style: "national" }),
    },
  });
  facultyIds.admin.push(adminHod.facultyId);

  for (const kp of KNOWN_PROCTORS) {
    const f = await prisma.faculty.create({
      data: {
        staffId: `STF${String(facultyIds.admin.length + facultyIds.proctor.length + 1).padStart(3, "0")}`,
        name: kp.name,
        shortCode: kp.shortCode,
        email: kp.email,
        role: "PROCTOR",
        cabinNo: `CSE-1${faker.number.int({ min: 1, max: 9 })}${faker.number.int({ min: 0, max: 9 })}`,
        telecomNo: String(faker.number.int({ min: 2210, max: 2299 })),
        phone: faker.phone.number({ style: "national" }),
      },
    });
    facultyIds.proctor.push(f.facultyId);
  }

  for (let i = facultyIds.admin.length + facultyIds.proctor.length; i < TOTAL_FACULTY; i++) {
    const name = `${faker.person.prefix()} ${faker.person.fullName()}`;
    const role = facultyIds.admin.length < ADMIN_COUNT && faker.datatype.boolean({ probability: 0.06 }) ? "ADMIN" : "PROCTOR";
    const f = await prisma.faculty.create({
      data: {
        staffId: `STF${String(i + 1).padStart(3, "0")}`,
        name,
        shortCode: uniqueShortCode(name),
        email: uniqueEmail(name),
        role,
        cabinNo: `CSE-${faker.number.int({ min: 1, max: 2 })}${faker.number.int({ min: 10, max: 99 })}`,
        telecomNo: String(faker.number.int({ min: 2200, max: 2299 })),
        phone: faker.phone.number({ style: "national" }),
      },
    });
    if (role === "ADMIN") facultyIds.admin.push(f.facultyId);
    else facultyIds.proctor.push(f.facultyId);
  }
  console.log(`  ${facultyIds.admin.length} Admins, ${facultyIds.proctor.length} Proctors.`);

  // --- Students (3000) across 4 cohorts, round-robin assigned to proctors.
  console.log("Generating students...");
  const KNOWN_STUDENTS = [
    { usn: "1BM22CS001", name: "Aarav Sharma", email: "aarav.sharma@bmsce.ac.in" },
    { usn: "1BM22CS002", name: "Diya Nair", email: "diya.nair@bmsce.ac.in" },
    { usn: "1BM22CS003", name: "Kabir Patel", email: "kabir.patel@bmsce.ac.in" },
    { usn: "1BM23CS045", name: "Meera Krishnan", email: "meera.krishnan@bmsce.ac.in" },
  ];
  const knownUsns = new Set(KNOWN_STUDENTS.map((s) => s.usn));
  const knownEmails = new Set(KNOWN_STUDENTS.map((s) => s.email));

  interface StudentRow {
    usn: string;
    name: string;
    section: string;
    admissionYear: number;
    currentSemester: number;
    proctorId: number;
    quota: string;
    fatherName: string;
    fatherPhone: string;
    motherName: string;
    motherPhone: string;
    localAddress: string;
    localGuardianName: string;
    localGuardianPhone: string;
    email: string;
  }

  const students: StudentRow[] = [];
  const quotas = ["CET", "COMEDK", "Management"];
  let proctorCursor = 0;
  let usnCounters: Record<number, number> = {};

  for (const cohort of COHORTS) {
    const yearSuffix = String(cohort.admissionYear).slice(2);
    usnCounters[cohort.admissionYear] = 0;

    for (let i = 0; i < STUDENTS_PER_COHORT; i++) {
      usnCounters[cohort.admissionYear]++;
      let usn = `1BM${yearSuffix}CS${String(usnCounters[cohort.admissionYear]).padStart(3, "0")}`;
      // Skip numbers already reserved for the hand-authored known students in this cohort.
      while (knownUsns.has(usn)) {
        usnCounters[cohort.admissionYear]++;
        usn = `1BM${yearSuffix}CS${String(usnCounters[cohort.admissionYear]).padStart(3, "0")}`;
      }

      const name = faker.person.fullName();
      let email = `${name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".")}@${DOMAIN}`;
      let n = 1;
      while (knownEmails.has(email) || students.some((s) => s.email === email)) {
        email = `${name.toLowerCase().replace(/[^a-z\s]/g, "").trim().split(/\s+/).slice(0, 2).join(".")}${n++}@${DOMAIN}`;
      }

      const proctorId = facultyIds.proctor[proctorCursor % facultyIds.proctor.length];
      proctorCursor++;

      students.push({
        usn,
        name,
        section: faker.helpers.arrayElement(SECTIONS),
        admissionYear: cohort.admissionYear,
        currentSemester: cohort.currentSemester,
        proctorId,
        quota: faker.helpers.arrayElement(quotas),
        fatherName: faker.person.fullName({ sex: "male" }),
        fatherPhone: `9${faker.string.numeric(9)}`,
        motherName: faker.person.fullName({ sex: "female" }),
        motherPhone: `9${faker.string.numeric(9)}`,
        localAddress: `${faker.location.streetAddress()}, Bengaluru`,
        localGuardianName: faker.datatype.boolean({ probability: 0.4 }) ? faker.person.fullName() : "-",
        localGuardianPhone: faker.datatype.boolean({ probability: 0.4 }) ? `9${faker.string.numeric(9)}` : "-",
        email,
      });
    }
  }

  // Splice in the 4 hand-authored known students (fixed content, easy to point
  // demos at) in place of one generated row per cohort, so the total stays 3000.
  const knownDefs = [
    { ...KNOWN_STUDENTS[0], section: "A", admissionYear: 2022, currentSemester: 7, proctorId: facultyIds.proctor[0], quota: "COMEDK" },
    { ...KNOWN_STUDENTS[1], section: "A", admissionYear: 2022, currentSemester: 7, proctorId: facultyIds.proctor[0], quota: "CET" },
    { ...KNOWN_STUDENTS[2], section: "B", admissionYear: 2022, currentSemester: 7, proctorId: facultyIds.proctor[1], quota: "Management" },
    { ...KNOWN_STUDENTS[3], section: "A", admissionYear: 2023, currentSemester: 5, proctorId: facultyIds.proctor[1], quota: "CET" },
  ];
  // Free up exactly 4 slots first, then push all 4 — popping and pushing inside
  // the same loop would pop each just-pushed known student right back off on
  // the next iteration, leaving only the last of the four in the array.
  for (let i = 0; i < knownDefs.length; i++) students.pop();
  for (const kd of knownDefs) {
    students.push({
      ...kd,
      fatherName: faker.person.fullName({ sex: "male" }),
      fatherPhone: `9${faker.string.numeric(9)}`,
      motherName: faker.person.fullName({ sex: "female" }),
      motherPhone: `9${faker.string.numeric(9)}`,
      localAddress: `${faker.location.streetAddress()}, Bengaluru`,
      localGuardianName: "-",
      localGuardianPhone: "-",
    });
  }

  for (const batch of chunk(students, 500)) {
    await prisma.student.createMany({ data: batch });
  }
  console.log(`  ${students.length} students created.`);

  // --- Result records: every semester from 1 through each student's current one.
  console.log("Generating result records (this is the bulk of the data)...");
  interface ResultRow {
    usn: string;
    subjectCode: string;
    subjectName: string;
    semester: number;
    sourceType: string;
    internalMarks: number;
    externalMarks: number;
    totalMarks: number;
    credits: number;
    grade: string;
    status: string;
    uploadedBy: number | null;
  }
  const results: ResultRow[] = [];

  function pushMainResult(usn: string, sem: number, subj: Subject, uploadedBy: number, forcedTotal?: number): { total: number; grade: string; status: string } {
    const total = forcedTotal ?? faker.number.int({ min: 30, max: 98 });
    const internal = Math.round(total * faker.number.float({ min: 0.22, max: 0.28 }));
    const external = total - internal;
    const { grade, status } = marksToGrade(total);
    results.push({
      usn,
      subjectCode: subj.code,
      subjectName: subj.name,
      semester: sem,
      sourceType: "MAIN",
      internalMarks: internal,
      externalMarks: external,
      totalMarks: total,
      credits: subj.credits,
      grade,
      status,
      uploadedBy,
    });
    return { total, grade, status };
  }

  for (const s of students) {
    if (knownUsns.has(s.usn)) continue; // hand-authored below, with guaranteed patterns instead of random ones

    for (let sem = 1; sem <= s.currentSemester; sem++) {
      const subjects = CURRICULUM[sem];
      const isLatestSemester = sem === s.currentSemester;

      for (const subj of subjects) {
        const main = pushMainResult(s.usn, sem, subj, s.proctorId);

        if (main.status === "FAIL") {
          const roll = faker.number.float({ min: 0, max: 1 });
          if (roll < 0.6) {
            // Cleared via a supplementary exam.
            const total = faker.number.int({ min: 40, max: 65 });
            const internal = Math.round(total * 0.25);
            const { grade, status } = marksToGrade(total);
            results.push({
              usn: s.usn, subjectCode: subj.code, subjectName: subj.name, semester: sem,
              sourceType: "SUPPLEMENTARY", internalMarks: internal, externalMarks: total - internal,
              totalMarks: total, credits: subj.credits, grade, status, uploadedBy: s.proctorId,
            });
          } else if (roll < 0.75) {
            // Overturned on revaluation.
            const total = faker.number.int({ min: 40, max: 55 });
            const internal = Math.round(total * 0.25);
            const { grade, status } = marksToGrade(total);
            results.push({
              usn: s.usn, subjectCode: subj.code, subjectName: subj.name, semester: sem,
              sourceType: "REVAL", internalMarks: internal, externalMarks: total - internal,
              totalMarks: total, credits: subj.credits, grade, status, uploadedBy: s.proctorId,
            });
          }
          // else: left as an open backlog — no follow-up record yet.
        }

        // Self-entered provisional results only make sense for the student's
        // current (most recently examined) semester — a placeholder ahead of
        // the official upload, not something you'd retroactively add years later.
        if (isLatestSemester && faker.number.float({ min: 0, max: 1 }) < 0.06) {
          const matches = faker.datatype.boolean({ probability: 0.5 });
          const total = matches ? main.total : main.total + faker.number.int({ min: -12, max: 12 });
          const clamped = Math.max(0, Math.min(100, total));
          const { grade } = marksToGrade(clamped);
          results.push({
            usn: s.usn, subjectCode: subj.code, subjectName: subj.name, semester: sem,
            sourceType: "STUDENT_PROVISIONAL", internalMarks: 0, externalMarks: 0,
            totalMarks: clamped, credits: subj.credits, grade, status: "PASS", uploadedBy: null,
          });
        }
      }
    }
  }

  // Hand-authored history for the 4 "known" students, so the discrepancy/
  // precedence-engine demo patterns are guaranteed rather than left to chance.
  function normalHistory(usn: string, proctorId: number, upToSem: number, skipSemSubjects: Set<string> = new Set()) {
    for (let sem = 1; sem <= upToSem; sem++) {
      for (const subj of CURRICULUM[sem]) {
        if (skipSemSubjects.has(`${sem}:${subj.code}`)) continue;
        pushMainResult(usn, sem, subj, proctorId, faker.number.int({ min: 55, max: 95 }));
      }
    }
  }

  const aarav = students.find((s) => s.usn === "1BM22CS001")!;
  normalHistory(aarav.usn, aarav.proctorId, aarav.currentSemester); // clean pass record throughout

  const diya = students.find((s) => s.usn === "1BM22CS002")!;
  normalHistory(diya.usn, diya.proctorId, diya.currentSemester, new Set(["5:CS51", "5:CS52"]));
  // Sem 5, CS51: official MAIN disagrees with her own earlier self-entry — discrepancy flag.
  results.push({ usn: diya.usn, subjectCode: "CS51", subjectName: "Software Engineering", semester: 5, sourceType: "STUDENT_PROVISIONAL", internalMarks: 0, externalMarks: 0, totalMarks: 78, credits: 4, grade: "A", status: "PASS", uploadedBy: null });
  pushMainResult(diya.usn, 5, CURRICULUM[5][0], diya.proctorId, 72); // CS51, MAIN — same letter grade, different marks: still a discrepancy
  // Sem 5, CS52: failed on MAIN, cleared via SUPPLEMENTARY.
  pushMainResult(diya.usn, 5, CURRICULUM[5][1], diya.proctorId, 32); // CS52, MAIN — F
  results.push({ usn: diya.usn, subjectCode: "CS52", subjectName: "Computer Networks", semester: 5, sourceType: "SUPPLEMENTARY", internalMarks: 15, externalMarks: 38, totalMarks: 53, credits: 4, grade: "B", status: "PASS", uploadedBy: diya.proctorId });

  const kabir = students.find((s) => s.usn === "1BM22CS003")!;
  normalHistory(kabir.usn, kabir.proctorId, kabir.currentSemester, new Set(["5:CS52"]));
  // Sem 5, CS52: failed on MAIN, overturned on REVAL.
  pushMainResult(kabir.usn, 5, CURRICULUM[5][1], kabir.proctorId, 35); // MAIN — F
  results.push({ usn: kabir.usn, subjectCode: "CS52", subjectName: "Computer Networks", semester: 5, sourceType: "REVAL", internalMarks: 18, externalMarks: 32, totalMarks: 50, credits: 4, grade: "B", status: "PASS", uploadedBy: kabir.proctorId });

  const meera = students.find((s) => s.usn === "1BM23CS045")!;
  normalHistory(meera.usn, meera.proctorId, meera.currentSemester); // shorter history — semester 5 only

  let inserted = 0;
  for (const batch of chunk(results, 800)) {
    await prisma.resultRecord.createMany({ data: batch });
    inserted += batch.length;
    if (inserted % 8000 === 0 || inserted === results.length) {
      process.stdout.write(`\r  ${inserted}/${results.length} result records...`);
    }
  }
  console.log(`\n  ${results.length} result records created.`);

  // --- Activity point claims: ~40% of students have at least one.
  console.log("Generating activity-point claims...");
  const claimDescriptions = [
    "Smart India Hackathon participation", "IEEE paper presentation", "NPTEL certification: Cloud Computing",
    "Inter-college coding contest", "Technical fest volunteer coordinator", "Open-source contribution (merged PR)",
    "Workshop on Machine Learning — attended", "College symposium — best paper award", "NSS community service, 40 hours",
    "Sports: state-level badminton tournament",
  ];
  const claims: { usn: string; proctorId: number; description: string; requestedPoints: number; grantedPoints: number | null; status: string; remarks: string | null }[] = [];
  for (const s of students) {
    const claimCount = faker.number.float({ min: 0, max: 1 }) < 0.35 ? 1 : faker.number.float({ min: 0, max: 1 }) < 0.08 ? 2 : 0;
    for (let c = 0; c < claimCount; c++) {
      const requested = faker.number.int({ min: 5, max: 40 });
      const statusRoll = faker.number.float({ min: 0, max: 1 });
      const status = statusRoll < 0.4 ? "PENDING" : statusRoll < 0.8 ? "APPROVED" : "REJECTED";
      claims.push({
        usn: s.usn,
        proctorId: s.proctorId,
        description: faker.helpers.arrayElement(claimDescriptions),
        requestedPoints: requested,
        grantedPoints: status === "APPROVED" ? faker.number.int({ min: Math.round(requested * 0.5), max: requested }) : null,
        status,
        remarks: status === "REJECTED" ? "Certificate unclear — please resubmit with a legible scan" : status === "APPROVED" ? "Verified" : null,
      });
    }
  }
  for (const batch of chunk(claims, 500)) {
    await prisma.activityPointClaim.createMany({ data: batch });
  }
  console.log(`  ${claims.length} activity-point claims created.`);

  // --- PTM records: 1-3 per proctor.
  console.log("Generating PTM records...");
  const ptms: { proctorId: number; ptmDate: string; ptmTime: string; notes: string }[] = [];
  for (const proctorId of facultyIds.proctor) {
    const count = faker.number.int({ min: 1, max: 3 });
    for (let i = 0; i < count; i++) {
      const date = faker.date.between({ from: "2026-08-01", to: "2026-11-30" });
      ptms.push({
        proctorId,
        ptmDate: date.toISOString().slice(0, 10),
        ptmTime: `${faker.number.int({ min: 9, max: 16 })}:${faker.helpers.arrayElement(["00", "30"])}`,
        notes: faker.helpers.arrayElement(["Mid-sem PTM", "End-sem PTM", "Backlog review with parents", "General progress review"]),
      });
    }
  }
  for (const batch of chunk(ptms, 500)) {
    await prisma.ptmRecord.createMany({ data: batch });
  }
  console.log(`  ${ptms.length} PTM records created.`);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);
  console.log(`Totals: ${TOTAL_FACULTY} faculty (${facultyIds.admin.length} Admin, ${facultyIds.proctor.length} Proctor), ${students.length} students, ${results.length} result records, ${claims.length} activity-point claims, ${ptms.length} PTM records.`);
  console.log("\nKnown accounts to log in with (mock OTP shown on screen):");
  console.log(`  Admin:   ${KNOWN_ADMIN.email}`);
  console.log(`  Proctor: ${KNOWN_PROCTORS[0].email}  (proctees include the two 'interesting' students below)`);
  console.log(`  Proctor: ${KNOWN_PROCTORS[1].email}`);
  console.log(`  Student: ${KNOWN_STUDENTS[0].email}  (${KNOWN_STUDENTS[0].usn}) — clean pass record, 7 semesters`);
  console.log(`  Student: ${KNOWN_STUDENTS[1].email}  (${KNOWN_STUDENTS[1].usn}) — has a discrepancy flag + a cleared backlog`);
  console.log(`  Student: ${KNOWN_STUDENTS[2].email}  (${KNOWN_STUDENTS[2].usn}) — has a REVAL that overturned a MAIN fail`);
  console.log(`  Student: ${KNOWN_STUDENTS[3].email}  (${KNOWN_STUDENTS[3].usn}) — semester 5, shorter history`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
