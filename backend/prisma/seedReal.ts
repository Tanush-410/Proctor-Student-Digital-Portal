/**
 * Loads the real BMSCE CSE Cluster-A cohort (all proctors/semesters) from
 * prisma/data/cohort.json into whatever database DATABASE_URL points at. This
 * is the actual data used in the live app — the snapshot is regenerated from
 * the live database by prisma/exportCohort.ts (`npm run seed:export`), or for
 * the original small PN/MVM subset, from department source files by
 * prisma/data/buildCohort.ts.
 *
 *   npm run seed
 *
 * Wipes faculty/student/result_record/claims/ptm first, so it is a full reset —
 * do not run it against a database you don't want replaced.
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/db";

type Cohort = {
  faculty: any[];
  students: any[];
  results: any[];
  claims: any[];
  ptm: any[];
};

async function main() {
  const file = path.join(__dirname, "data", "cohort.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Cohort;

  console.log("Wiping existing data...");
  // Deletion order matters — every table below has a foreign key into
  // student and/or faculty, so both must be emptied last. This list has
  // grown as features were added (messages, mark requests, circulars,
  // subject attendance, audit log, notifications); missing one here just
  // makes faculty.deleteMany() fail with a P2003 instead of silently losing
  // data, but keep it in sync with schema.prisma when adding a new relation.
  await prisma.circularRecipient.deleteMany();
  await prisma.circular.deleteMany();
  await prisma.markRequest.deleteMany();
  await prisma.subjectAttendance.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.studentNote.deleteMany();
  await prisma.ptmRecord.deleteMany();
  await prisma.activityPointClaim.deleteMany();
  await prisma.resultRecord.deleteMany();
  await prisma.accolade.deleteMany();
  await prisma.student.deleteMany();
  await prisma.message.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.importException.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.session.deleteMany();
  await prisma.faculty.deleteMany();

  console.log(`Seeding ${data.faculty.length} faculty...`);
  for (const f of data.faculty) {
    await prisma.faculty.create({
      data: {
        facultyId: f.facultyId,
        staffId: f.staffId,
        name: f.name,
        shortCode: f.shortCode,
        cabinNo: f.cabinNo ?? null,
        telecomNo: f.telecomNo ?? null,
        phone: f.phone ?? null,
        email: f.email,
        role: f.role,
        cluster: f.cluster ?? null,
      },
    });
  }
  // keep the autoincrement sequence ahead of the explicit ids we just inserted
  const maxId = Math.max(...data.faculty.map((f) => f.facultyId));
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('faculty', 'faculty_id'), ${maxId}, true)`
  );

  console.log(`Seeding ${data.students.length} students...`);
  for (const s of data.students) {
    await prisma.student.create({
      data: {
        usn: s.usn,
        name: s.name,
        section: s.section ?? null,
        admissionYear: s.admissionYear,
        currentSemester: s.currentSemester ?? 1,
        proctorId: s.proctorId ?? null,
        quota: s.quota ?? null,
        fatherName: s.fatherName ?? null,
        fatherPhone: s.fatherPhone ?? null,
        motherName: s.motherName ?? null,
        motherPhone: s.motherPhone ?? null,
        localAddress: s.localAddress ?? null,
        localGuardianName: s.localGuardianName ?? null,
        localGuardianPhone: s.localGuardianPhone ?? null,
        email: s.email,
      },
    });
  }

  console.log(`Seeding ${data.results.length} result records...`);
  for (const r of data.results) {
    await prisma.resultRecord.create({
      data: {
        usn: r.usn,
        subjectCode: r.subjectCode,
        subjectName: r.subjectName ?? null,
        semester: r.semester,
        sourceType: r.sourceType,
        internalMarks: typeof r.internalMarks === "number" ? r.internalMarks : null,
        externalMarks: typeof r.externalMarks === "number" ? r.externalMarks : null,
        totalMarks: typeof r.totalMarks === "number" ? r.totalMarks : null,
        credits: r.credits ?? 0,
        grade: r.grade ?? null,
        status: r.status,
      },
    });
  }

  const [fac, stu, res] = await Promise.all([
    prisma.faculty.count(),
    prisma.student.count(),
    prisma.resultRecord.count(),
  ]);
  console.log(`\nDone. ${fac} faculty, ${stu} students, ${res} results.`);
  console.log("Login e-mails: shuba.rao@bmsce.ac.in (Admin), praveen.cse@bmsce.ac.in / megavalli.cse@bmsce.ac.in (Proctors)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
