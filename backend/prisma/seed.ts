import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding...");

  await prisma.importException.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.activityPointClaim.deleteMany();
  await prisma.ptmRecord.deleteMany();
  await prisma.resultRecord.deleteMany();
  await prisma.student.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.faculty.deleteMany();

  const hod = await prisma.faculty.create({
    data: {
      staffId: "STF001",
      name: "Dr. Ramesh Iyer",
      shortCode: "RI",
      cabinNo: "CSE-201",
      telecomNo: "2201",
      phone: "9880012345",
      email: "hod.cse@bmsce.ac.in",
      role: "ADMIN",
    },
  });

  const proctor1 = await prisma.faculty.create({
    data: {
      staffId: "STF014",
      name: "Prof. Anjali Rao",
      shortCode: "AR",
      cabinNo: "CSE-104",
      telecomNo: "2214",
      phone: "9880023456",
      email: "anjali.rao@bmsce.ac.in",
      role: "PROCTOR",
    },
  });

  const proctor2 = await prisma.faculty.create({
    data: {
      staffId: "STF022",
      name: "Prof. Sunil Kumar",
      shortCode: "SK",
      cabinNo: "CSE-108",
      telecomNo: "2222",
      phone: "9880034567",
      email: "sunil.kumar@bmsce.ac.in",
      role: "PROCTOR",
    },
  });

  const studentsData = [
    {
      usn: "1BM22CS001",
      name: "Aarav Sharma",
      section: "A",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: proctor1.facultyId,
      quota: "COMEDK",
      fatherName: "Rajesh Sharma",
      fatherPhone: "9900011111",
      motherName: "Sunita Sharma",
      motherPhone: "9900011112",
      localAddress: "12, MG Road, Bengaluru",
      localGuardianName: "Vikram Sharma (Uncle)",
      localGuardianPhone: "9900011113",
      email: "aarav.sharma@bmsce.ac.in",
    },
    {
      usn: "1BM22CS002",
      name: "Diya Nair",
      section: "A",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: proctor1.facultyId,
      quota: "CET",
      fatherName: "Suresh Nair",
      fatherPhone: "9900022221",
      motherName: "Latha Nair",
      motherPhone: "9900022222",
      localAddress: "45, Jayanagar, Bengaluru",
      localGuardianName: "-",
      localGuardianPhone: "-",
      email: "diya.nair@bmsce.ac.in",
    },
    {
      usn: "1BM22CS003",
      name: "Kabir Patel",
      section: "B",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: proctor2.facultyId,
      quota: "Management",
      fatherName: "Amit Patel",
      fatherPhone: "9900033331",
      motherName: "Priya Patel",
      motherPhone: "9900033332",
      localAddress: "78, Indiranagar, Bengaluru",
      localGuardianName: "Nikhil Patel (Brother)",
      localGuardianPhone: "9900033333",
      email: "kabir.patel@bmsce.ac.in",
    },
    {
      usn: "1BM23CS045",
      name: "Meera Krishnan",
      section: "A",
      admissionYear: 2023,
      currentSemester: 3,
      proctorId: proctor2.facultyId,
      quota: "CET",
      fatherName: "Krishnan Pillai",
      fatherPhone: "9900044441",
      motherName: "Radha Krishnan",
      motherPhone: "9900044442",
      localAddress: "9, Malleshwaram, Bengaluru",
      localGuardianName: "-",
      localGuardianPhone: "-",
      email: "meera.krishnan@bmsce.ac.in",
    },
  ];

  for (const s of studentsData) {
    await prisma.student.create({ data: s });
  }

  const subjects5 = [
    { code: "CS51", name: "Software Engineering", credits: 4 },
    { code: "CS52", name: "Computer Networks", credits: 4 },
    { code: "CS53", name: "Automata Theory", credits: 3 },
    { code: "CS54", name: "Machine Learning", credits: 4 },
  ];

  // Aarav — clean MAIN results, all pass.
  for (const sub of subjects5) {
    await prisma.resultRecord.create({
      data: {
        usn: "1BM22CS001",
        subjectCode: sub.code,
        subjectName: sub.name,
        semester: 5,
        sourceType: "MAIN",
        internalMarks: 22,
        externalMarks: 58,
        totalMarks: 80,
        credits: sub.credits,
        grade: "A",
        status: "PASS",
        uploadedBy: proctor1.facultyId,
      },
    });
  }

  // Diya — one backlog (CS53 fail on MAIN), later cleared via SUPPLEMENTARY; also has a
  // provisional self-entry that disagrees with the eventual official CS51 result (discrepancy demo).
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS51", subjectName: "Software Engineering", semester: 5, sourceType: "STUDENT_PROVISIONAL", totalMarks: 78, grade: "A", credits: 4, status: "PASS" },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS51", subjectName: "Software Engineering", semester: 5, sourceType: "MAIN", internalMarks: 20, externalMarks: 52, totalMarks: 72, grade: "B+", credits: 4, status: "PASS", uploadedBy: proctor1.facultyId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS52", subjectName: "Computer Networks", semester: 5, sourceType: "MAIN", internalMarks: 21, externalMarks: 55, totalMarks: 76, grade: "A", credits: 4, status: "PASS", uploadedBy: proctor1.facultyId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS53", subjectName: "Automata Theory", semester: 5, sourceType: "MAIN", internalMarks: 15, externalMarks: 20, totalMarks: 35, grade: "F", credits: 3, status: "FAIL", uploadedBy: proctor1.facultyId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS53", subjectName: "Automata Theory", semester: 5, sourceType: "SUPPLEMENTARY", internalMarks: 15, externalMarks: 38, totalMarks: 53, grade: "C", credits: 3, status: "PASS", uploadedBy: proctor1.facultyId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS002", subjectCode: "CS54", subjectName: "Machine Learning", semester: 5, sourceType: "MAIN", internalMarks: 24, externalMarks: 60, totalMarks: 84, grade: "O", credits: 4, status: "PASS", uploadedBy: proctor1.facultyId },
  });

  // Kabir — a REVAL that overturns a MAIN fail.
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS003", subjectCode: "CS52", subjectName: "Computer Networks", semester: 5, sourceType: "MAIN", internalMarks: 18, externalMarks: 22, totalMarks: 40, grade: "F", credits: 4, status: "FAIL", uploadedBy: proctor2.facultyId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1BM22CS003", subjectCode: "CS52", subjectName: "Computer Networks", semester: 5, sourceType: "REVAL", internalMarks: 18, externalMarks: 32, totalMarks: 50, grade: "P", credits: 4, status: "PASS", uploadedBy: proctor2.facultyId },
  });

  // Meera — semester 3.
  const subjects3 = [
    { code: "CS31", name: "Data Structures", credits: 4 },
    { code: "CS32", name: "Discrete Mathematics", credits: 3 },
  ];
  for (const sub of subjects3) {
    await prisma.resultRecord.create({
      data: { usn: "1BM23CS045", subjectCode: sub.code, subjectName: sub.name, semester: 3, sourceType: "MAIN", internalMarks: 23, externalMarks: 54, totalMarks: 77, grade: "A", credits: sub.credits, status: "PASS", uploadedBy: proctor2.facultyId },
    });
  }

  await prisma.activityPointClaim.createMany({
    data: [
      { usn: "1BM22CS001", proctorId: proctor1.facultyId, description: "Winner, Smart India Hackathon 2025", requestedPoints: 40, status: "APPROVED", grantedPoints: 40, remarks: "Verified certificate", reviewedAt: new Date() },
      { usn: "1BM22CS001", proctorId: proctor1.facultyId, description: "NPTEL course: Cloud Computing", requestedPoints: 20, status: "PENDING" },
      { usn: "1BM22CS002", proctorId: proctor1.facultyId, description: "IEEE paper presentation", requestedPoints: 15, status: "PENDING" },
      { usn: "1BM22CS003", proctorId: proctor2.facultyId, description: "Inter-college coding contest, 2nd place", requestedPoints: 25, status: "REJECTED", remarks: "Certificate illegible, please resubmit", reviewedAt: new Date() },
    ],
  });

  await prisma.ptmRecord.createMany({
    data: [
      { proctorId: proctor1.facultyId, ptmDate: "2026-09-12", ptmTime: "10:00", notes: "Mid-sem PTM — Section A" },
      { proctorId: proctor2.facultyId, ptmDate: "2026-09-13", ptmTime: "11:00", notes: "Mid-sem PTM — Section B" },
    ],
  });

  console.log("Seed complete.");
  console.log("Login e-mails: hod.cse@bmsce.ac.in (Admin), anjali.rao@bmsce.ac.in / sunil.kumar@bmsce.ac.in (Proctor),");
  console.log("aarav.sharma@bmsce.ac.in / diya.nair@bmsce.ac.in / kabir.patel@bmsce.ac.in / meera.krishnan@bmsce.ac.in (Student)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
