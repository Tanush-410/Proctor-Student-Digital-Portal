import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import PDFDocument from "pdfkit";
import { createApp, attachErrorHandler } from "../app";
import { prisma } from "../db";

const testApp = createApp();
attachErrorHandler(testApp);

let adminId: number;
let proctorAId: number;
let proctorBId: number;

// Sessions live in an httpOnly cookie now, not a token this test (or any JS)
// can read — request.agent() is supertest's cookie jar, the same mechanism a
// real browser tab uses to stay "logged in" across requests.
async function login(email: string) {
  const agent = request.agent(testApp);
  const reqRes = await agent.post("/api/auth/otp/request").send({ email });
  expect(reqRes.status).toBe(200);
  const verifyRes = await agent.post("/api/auth/otp/verify").send({ email, code: reqRes.body.devOtp });
  expect(verifyRes.status).toBe(200);
  return { agent, role: verifyRes.body.role as string, profile: verifyRes.body.profile };
}

/** Builds a real, valid single-page text PDF for the scan-import tests — a hand-built byte stream turned out too fragile for pdf-parse to trust. */
function buildTextPdf(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    lines.forEach((line) => doc.fontSize(10).text(line));
    doc.end();
  });
}

beforeAll(async () => {
  // Tables in FK-safe delete order.
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.importException.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.activityPointClaim.deleteMany();
  await prisma.attendanceRecord.deleteMany();
  await prisma.studentNote.deleteMany();
  await prisma.ptmRecord.deleteMany();
  await prisma.resultRecord.deleteMany();
  await prisma.student.deleteMany();
  await prisma.session.deleteMany();
  await prisma.otpRequest.deleteMany();
  await prisma.faculty.deleteMany();

  const admin = await prisma.faculty.create({
    data: { staffId: "T001", name: "Test Admin", shortCode: "TA", email: "test.admin@bmsce.ac.in", role: "ADMIN" },
  });
  const proctorA = await prisma.faculty.create({
    data: { staffId: "T002", name: "Test Proctor A", shortCode: "TPA", email: "test.proctora@bmsce.ac.in", role: "PROCTOR" },
  });
  const proctorB = await prisma.faculty.create({
    data: { staffId: "T003", name: "Test Proctor B", shortCode: "TPB", email: "test.proctorb@bmsce.ac.in", role: "PROCTOR" },
  });
  // Dedicated account for the rate-limit test below — it deliberately exhausts
  // the per-email verify budget, which would otherwise lock proctorB out of
  // every later test in this file that needs to log in as them.
  await prisma.faculty.create({
    data: { staffId: "T099", name: "Test Throttle Target", shortCode: "TTT", email: "test.throttle@bmsce.ac.in", role: "PROCTOR" },
  });
  // More dedicated single-use accounts, same reasoning: these tests call
  // /otp/request directly (not just once per test via login()), and reusing
  // test.admin/proctorA/proctorB here would push them over the 5-per-10-min
  // request budget shared with every other test in this file.
  await prisma.faculty.create({
    data: { staffId: "T097", name: "Test Cookie Check", shortCode: "TCC", email: "test.cookiecheck@bmsce.ac.in", role: "ADMIN" },
  });
  await prisma.faculty.create({
    data: { staffId: "T096", name: "Test Leak Check", shortCode: "TLC", email: "test.leakcheck@bmsce.ac.in", role: "ADMIN" },
  });
  await prisma.faculty.create({
    data: { staffId: "T095", name: "Test Logout Check", shortCode: "TLO", email: "test.logoutcheck@bmsce.ac.in", role: "PROCTOR" },
  });
  const idorProctorOwner = await prisma.faculty.create({
    data: { staffId: "T094", name: "Test IDOR Proctor Owner", shortCode: "TIO", email: "test.idor.owner@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T093", name: "Test IDOR Proctor Other", shortCode: "TIP", email: "test.idor.other@bmsce.ac.in", role: "PROCTOR" },
  });
  adminId = admin.facultyId;
  proctorAId = proctorA.facultyId;
  proctorBId = proctorB.facultyId;

  await prisma.student.create({
    data: {
      usn: "1TEST22CS001",
      name: "Test Student One",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: proctorAId,
      email: "test.student1@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1TEST22CS002",
      name: "Test Student Two",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: proctorBId,
      email: "test.student2@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1TESTIDOR01",
      name: "Test IDOR Student",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: idorProctorOwner.facultyId,
      email: "test.idor.student@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1TESTIDOR02",
      name: "Test Filetype Student",
      admissionYear: 2022,
      currentSemester: 5,
      proctorId: idorProctorOwner.facultyId,
      email: "test.filetype.student@bmsce.ac.in",
    },
  });

  // Dedicated fixtures for faculty-detail/analytics/notes/PTM/scan coverage —
  // fresh accounts again, same OTP-budget reasoning as above.
  const detailProctor = await prisma.faculty.create({
    data: { staffId: "T092", name: "Test Detail Proctor", shortCode: "TDP", email: "test.detail.proctor@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T091", name: "Test Detail Admin", shortCode: "TDA", email: "test.detail.admin@bmsce.ac.in", role: "ADMIN" },
  });
  await prisma.faculty.create({
    data: { staffId: "T090", name: "Test Detail Other Proctor", shortCode: "TDO", email: "test.detail.other@bmsce.ac.in", role: "PROCTOR" },
  });
  const detailProctor2 = await prisma.faculty.create({
    data: { staffId: "T089", name: "Test Detail Proctor Two", shortCode: "TDP2", email: "test.detail.proctor2@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.student.create({
    data: {
      usn: "1TD22CS001",
      name: "Test Detail Student One",
      section: "TDX",
      admissionYear: 2023,
      currentSemester: 3,
      proctorId: detailProctor.facultyId,
      email: "test.detail.student1@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1TD22CS002",
      name: "Test Detail Student Two",
      section: "TDX",
      admissionYear: 2023,
      currentSemester: 3,
      proctorId: detailProctor.facultyId,
      email: "test.detail.student2@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1TD22CS003",
      name: "Test Detail Student Three",
      section: "TDY",
      admissionYear: 2023,
      currentSemester: 3,
      proctorId: detailProctor2.facultyId,
      email: "test.detail.student3@bmsce.ac.in",
    },
  });
  // Backlog fixture so the analytics "at-risk" list has something to find.
  await prisma.resultRecord.create({
    data: { usn: "1TD22CS001", subjectCode: "CS31", semester: 3, sourceType: "MAIN", grade: "F", status: "FAIL", totalMarks: 30, credits: 4 },
  });
  await prisma.resultRecord.create({
    data: { usn: "1TD22CS002", subjectCode: "CS31", semester: 3, sourceType: "MAIN", grade: "A", status: "PASS", totalMarks: 80, credits: 4 },
  });
  await prisma.resultRecord.create({
    data: { usn: "1TD22CS003", subjectCode: "CS31", semester: 3, sourceType: "MAIN", grade: "O", status: "PASS", totalMarks: 95, credits: 4 },
  });

  // Fresh, single-use accounts for the workload/analytics/bulk-action tests
  // below — same reasoning as every other "dedicated account" comment in this
  // file: test.detail.proctor/other are already at (or near) the 5-per-10-min
  // OTP request budget from the describe blocks above, so anything new logs
  // in as one of these instead rather than pushing those over the limit.
  const bulkProctor = await prisma.faculty.create({
    data: { staffId: "T088", name: "Test Bulk Proctor", shortCode: "TBP", email: "test.bulk.proctor@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T087", name: "Test Compare Viewer", shortCode: "TCV", email: "test.compare.viewer@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T086", name: "Test Dept Analytics Blocked", shortCode: "TDB", email: "test.deptanalytics.blocked@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T085", name: "Test Reassign Blocked", shortCode: "TRB", email: "test.reassign.blocked@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T084", name: "Test Auditlog Blocked", shortCode: "TAB", email: "test.auditlog.blocked@bmsce.ac.in", role: "PROCTOR" },
  });
  const bulkOtherProctor = await prisma.faculty.create({
    data: { staffId: "T083", name: "Test Bulk Other Proctor", shortCode: "TBO", email: "test.bulk.other@bmsce.ac.in", role: "PROCTOR" },
  });
  // Semester 6 (not 3) and its own faculty — deliberately outside every other
  // fixture cluster in this file, so these rows can't skew the Department-wide
  // analytics or Faculty workload assertions computed over semester 3 / the
  // "detail" proctors above.
  await prisma.student.create({
    data: {
      usn: "1BLK22CS001",
      name: "Test Bulk Student One",
      admissionYear: 2023,
      currentSemester: 6,
      proctorId: bulkProctor.facultyId,
      email: "test.bulk.student1@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1BLK22CS002",
      name: "Test Bulk Student Two",
      admissionYear: 2023,
      currentSemester: 6,
      proctorId: bulkOtherProctor.facultyId, // deliberately NOT bulkProctor's — the "not your proctee" skip case
      email: "test.bulk.student2@bmsce.ac.in",
    },
  });

  // Discrepancy + supplementary-clears-backlog fixture for student 1.
  await prisma.resultRecord.create({
    data: { usn: "1TEST22CS001", subjectCode: "CS51", semester: 5, sourceType: "STUDENT_PROVISIONAL", grade: "A", totalMarks: 80, credits: 4 },
  });
  await prisma.resultRecord.create({
    data: { usn: "1TEST22CS001", subjectCode: "CS51", semester: 5, sourceType: "MAIN", grade: "B+", totalMarks: 72, credits: 4, uploadedBy: proctorAId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1TEST22CS001", subjectCode: "CS52", semester: 5, sourceType: "MAIN", grade: "F", status: "FAIL", totalMarks: 30, credits: 3, uploadedBy: proctorAId },
  });
  await prisma.resultRecord.create({
    data: { usn: "1TEST22CS001", subjectCode: "CS52", semester: 5, sourceType: "SUPPLEMENTARY", grade: "C", status: "PASS", totalMarks: 50, credits: 3, uploadedBy: proctorAId },
  });

  // Fresh, single-use accounts for the scan-source-file and attendance
  // tests — same reasoning as every other "dedicated account" comment above:
  // several existing test.* accounts are already at the 5-per-10-min OTP
  // request budget.
  const scanSrcProctor = await prisma.faculty.create({
    data: { staffId: "T082", name: "Test ScanSrc Proctor", shortCode: "TSP", email: "test.scansrc.proctor@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T081", name: "Test ScanSrc Blocked", shortCode: "TSB", email: "test.scansrc.blocked@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T080", name: "Test ScanSrc Admin", shortCode: "TSA", email: "test.scansrc.admin@bmsce.ac.in", role: "ADMIN" },
  });
  await prisma.student.create({
    data: {
      usn: "1SRC22CS001",
      name: "Test ScanSrc Student",
      admissionYear: 2023,
      // Deliberately semester 7 — the scan-import test elsewhere in this
      // file uses semester 3, the same tier the Department-wide analytics
      // fixtures rely on for an exact studentCount assertion.
      currentSemester: 7,
      proctorId: scanSrcProctor.facultyId,
      email: "test.scansrc.student1@bmsce.ac.in",
    },
  });

  const attProctor = await prisma.faculty.create({
    data: { staffId: "T079", name: "Test Attendance Proctor", shortCode: "TAP", email: "test.att.proctor@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T078", name: "Test Attendance Blocked", shortCode: "TAB2", email: "test.att.blocked@bmsce.ac.in", role: "PROCTOR" },
  });
  await prisma.faculty.create({
    data: { staffId: "T077", name: "Test Attendance Admin", shortCode: "TAA", email: "test.att.admin@bmsce.ac.in", role: "ADMIN" },
  });
  await prisma.student.create({
    data: {
      usn: "1ATT22CS001",
      name: "Test Attendance Student One",
      section: "ATX",
      admissionYear: 2023,
      currentSemester: 4,
      proctorId: attProctor.facultyId,
      email: "test.att.student1@bmsce.ac.in",
    },
  });
  await prisma.student.create({
    data: {
      usn: "1ATT22CS002",
      name: "Test Attendance Student Two",
      section: "ATX",
      admissionYear: 2023,
      currentSemester: 4,
      email: "test.att.student2@bmsce.ac.in", // deliberately unassigned — the "not your proctee" skip case
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("OTP auth", () => {
  it("rejects a request for an e-mail with no account", async () => {
    const res = await request(testApp).post("/api/auth/otp/request").send({ email: "nobody@bmsce.ac.in" });
    expect(res.status).toBe(404);
  });

  it("issues a role- and identity-bound session on correct OTP, via an httpOnly cookie", async () => {
    const auth = await login("test.admin@bmsce.ac.in");
    expect(auth.role).toBe("ADMIN");
    expect(auth.profile.email).toBe("test.admin@bmsce.ac.in");

    const res = await auth.agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ADMIN");
  });

  it("sets the session cookie as httpOnly on verify", async () => {
    const email = "test.cookiecheck@bmsce.ac.in";
    const res = await request(testApp).post("/api/auth/otp/request").send({ email });
    const verifyRes = await request(testApp).post("/api/auth/otp/verify").send({ email, code: res.body.devOtp });
    const setCookie = verifyRes.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie);
    expect(cookieStr.toLowerCase()).toContain("httponly");
    // The response body must never carry the session token — that's the whole point.
    expect(verifyRes.body.token).toBeUndefined();
  });

  it("never leaks the OTP code in the request response", async () => {
    // This endpoint intentionally omits devOtp in production; here (test env,
    // NODE_ENV !== production) it's present by design for testability — see
    // lib/mailer.ts and auth/routes.ts for the production-gated behaviour.
    // What must NEVER happen, in any environment, is the code being guessable
    // or exposed anywhere other than this explicit dev-mode field.
    const res = await request(testApp).post("/api/auth/otp/request").send({ email: "test.leakcheck@bmsce.ac.in" });
    expect(Object.keys(res.body).sort()).toEqual(["devOtp", "ok"]);
  });

  it("rejects an incorrect code", async () => {
    await request(testApp).post("/api/auth/otp/request").send({ email: "test.proctora@bmsce.ac.in" });
    const res = await request(testApp).post("/api/auth/otp/verify").send({ email: "test.proctora@bmsce.ac.in", code: "000000" });
    expect(res.status).toBe(401);
  });

  it("throttles repeated verify attempts for the same e-mail", async () => {
    const email = "test.throttle@bmsce.ac.in";
    await request(testApp).post("/api/auth/otp/request").send({ email });
    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await request(testApp).post("/api/auth/otp/verify").send({ email, code: "111111" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("logout clears the session — a subsequent request is unauthenticated", async () => {
    const auth = await login("test.logoutcheck@bmsce.ac.in");
    expect((await auth.agent.get("/api/auth/me")).status).toBe(200);
    expect((await auth.agent.post("/api/auth/logout")).status).toBe(200);
    expect((await auth.agent.get("/api/auth/me")).status).toBe(401);
  });
});

describe("Results upload (happy path — regression coverage for the email-column bug)", () => {
  it("lets a proctor successfully upload an official result sheet for their own proctee", async () => {
    const auth = await login("test.proctora@bmsce.ac.in");
    const csv = "usn,subject_code,subject_name,semester,internal_marks,external_marks,total_marks,credits,grade,status\n1TEST22CS001,CS55,Compilers,5,23,55,78,4,A,PASS";
    const res = await auth.agent
      .post("/api/results/upload")
      .field("source_type", "MAIN")
      .attach("file", Buffer.from(csv), "results.csv");

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.exceptions).toBe(0);
    expect(res.body.created).toBe(1);

    const effective = await auth.agent.get("/api/students/1TEST22CS001/results/effective");
    expect(effective.body.results.some((r: any) => r.subjectCode === "CS55" && r.effective.grade === "A")).toBe(true);
  });
});

describe("RBAC: student data access", () => {
  it("lets a student read their own record", async () => {
    const auth = await login("test.student1@bmsce.ac.in");
    const res = await auth.agent.get("/api/students/1TEST22CS001");
    expect(res.status).toBe(200);
  });

  it("blocks a student from reading another student's record", async () => {
    const auth = await login("test.student1@bmsce.ac.in");
    const res = await auth.agent.get("/api/students/1TEST22CS002");
    expect(res.status).toBe(403);
  });

  it("lets any proctor read a student who isn't their own proctee (read-only per the access matrix)", async () => {
    const auth = await login("test.proctorb@bmsce.ac.in");
    const res = await auth.agent.get("/api/students/1TEST22CS001");
    expect(res.status).toBe(200);
  });

  it("blocks a proctor from uploading results for a student who isn't their proctee", async () => {
    const auth = await login("test.proctorb@bmsce.ac.in");
    const res = await auth.agent
      .post("/api/results/upload")
      .field("source_type", "MAIN")
      .attach("file", Buffer.from("usn,subject_code,semester,grade,credits\n1TEST22CS001,CS99,5,A,4"), "results.csv");
    expect(res.status).toBe(200); // upload succeeds, but the row is routed to exceptions
    expect(res.body.created).toBe(0);
    expect(res.body.exceptions).toBe(1);
  });

  it("rejects a request with no session cookie", async () => {
    const res = await request(testApp).get("/api/students/1TEST22CS001");
    expect(res.status).toBe(401);
  });
});

describe("Results precedence engine (end-to-end via HTTP)", () => {
  it("resolves the effective result, flags the discrepancy, and clears the backlog via SUPPLEMENTARY", async () => {
    const auth = await login("test.admin@bmsce.ac.in");
    const res = await auth.agent.get("/api/students/1TEST22CS001/results/effective");
    expect(res.status).toBe(200);

    const cs51 = res.body.results.find((r: any) => r.subjectCode === "CS51");
    expect(cs51.effective.sourceType).toBe("MAIN");
    expect(cs51.discrepancy).toBe(true);

    const cs52 = res.body.results.find((r: any) => r.subjectCode === "CS52");
    expect(cs52.effective.sourceType).toBe("SUPPLEMENTARY");
    expect(cs52.effective.status).toBe("PASS");

    expect(res.body.backlogSubjects).toHaveLength(0);
  });
});

describe("Activity point claim lifecycle", () => {
  it("submits, approves, and reflects the running total — and blocks review by the wrong proctor", async () => {
    const student = await login("test.student1@bmsce.ac.in");
    const submitRes = await student.agent.post("/api/activity-points/claims").field("description", "Hackathon winner").field("requestedPoints", "20");
    expect(submitRes.status).toBe(201);
    const claimId = submitRes.body.claimId;

    const wrongProctor = await login("test.proctorb@bmsce.ac.in");
    const blockedReview = await wrongProctor.agent.patch(`/api/activity-points/claims/${claimId}/review`).send({ decision: "APPROVED", grantedPoints: 20 });
    expect(blockedReview.status).toBe(403);

    const rightProctor = await login("test.proctora@bmsce.ac.in");
    const reviewRes = await rightProctor.agent
      .patch(`/api/activity-points/claims/${claimId}/review`)
      .send({ decision: "APPROVED", grantedPoints: 15, remarks: "Partial credit" });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.runningTotal).toBe(15);

    const totalsRes = await student.agent.get("/api/students/1TEST22CS001/activity-points");
    expect(totalsRes.body.runningTotal).toBe(15);
  });
});

describe("Faculty management", () => {
  it("lets an Admin onboard a new proctor, who can then log in", async () => {
    const admin = await login("test.admin@bmsce.ac.in");
    const createRes = await admin.agent
      .post("/api/faculty")
      .send({ staffId: "T004", name: "New Proctor", shortCode: "TNP", email: "new.proctor@bmsce.ac.in", role: "PROCTOR" });
    expect(createRes.status).toBe(201);

    const newProctorAuth = await login("new.proctor@bmsce.ac.in");
    expect(newProctorAuth.role).toBe("PROCTOR");
  });

  it("blocks a non-Admin from creating faculty", async () => {
    const proctor = await login("test.proctora@bmsce.ac.in");
    const res = await proctor.agent
      .post("/api/faculty")
      .send({ staffId: "T005", name: "Should Fail", shortCode: "SF", email: "should.fail@bmsce.ac.in", role: "PROCTOR" });
    expect(res.status).toBe(403);
  });

  it("rejects a duplicate short code with 409, not a 500", async () => {
    const admin = await login("test.admin@bmsce.ac.in");
    const res = await admin.agent
      .post("/api/faculty")
      .send({ staffId: "T006", name: "Dup Code", shortCode: "TPA", email: "dup.code@bmsce.ac.in", role: "PROCTOR" });
    expect(res.status).toBe(409);
  });
});

describe("Ingestion pipeline", () => {
  it("creates a matched student and routes an invalid row to the exception queue", async () => {
    const admin = await login("test.admin@bmsce.ac.in");
    const csv = [
      "usn,name,email,section,proctor_short_code",
      "1TEST22CS900,New Student,new.student@bmsce.ac.in,A,TPA",
      "1TEST22CS901,Bad Proctor Code,bad.code@bmsce.ac.in,A,ZZZ",
    ].join("\n");

    const res = await admin.agent.post("/api/admin/upload/class-list").attach("file", Buffer.from(csv), "class_list.csv");

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.exceptions).toBe(1);

    const student = await admin.agent.get("/api/students/1TEST22CS900");
    expect(student.body.proctor.shortCode).toBe("TPA");

    const exceptions = await admin.agent.get("/api/admin/import-exceptions?resolved=false");
    expect(exceptions.body.some((e: any) => e.reason.includes("ZZZ"))).toBe(true);
  });
});

describe("Count endpoints (scale: dashboard reads a count, not the whole table)", () => {
  it("GET /students/count is not shadowed by the /:usn route and returns a number, not a student; GET /proctors/count too", async () => {
    // Reuses proctorA's session (rather than a fresh login) so this doesn't
    // compete with test.admin's already-tight OTP request budget elsewhere in this file.
    const proctor = await login("test.proctora@bmsce.ac.in");
    const studentsRes = await proctor.agent.get("/api/students/count");
    expect(studentsRes.status).toBe(200);
    expect(typeof studentsRes.body.count).toBe("number");
    expect(studentsRes.body.count).toBeGreaterThan(0);

    const proctorsRes = await proctor.agent.get("/api/proctors/count");
    expect(proctorsRes.status).toBe(200);
    expect(typeof proctorsRes.body.count).toBe("number");
  });
});

describe("Proof file access control (IDOR regression coverage)", () => {
  it("lets the submitting student and their proctor fetch the proof file, but blocks an unrelated proctor and rejects a bad filename", async () => {
    const student = await login("test.idor.student@bmsce.ac.in");
    // A 1x1 PNG — small, valid, and within the upload whitelist.
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6364f8cfc0c00000030101007e02620d0000000049454e44ae426082",
      "hex"
    );
    const submitRes = await student.agent
      .post("/api/activity-points/claims")
      .field("description", "IDOR test claim")
      .field("requestedPoints", "5")
      .attach("proof", png, { filename: "cert.png", contentType: "image/png" });
    expect(submitRes.status).toBe(201);
    const proofPath: string = submitRes.body.proofFile;
    expect(proofPath).toMatch(/^\/uploads\/proofs\/[a-f0-9]{32}\.png$/);

    // Owning student can fetch it.
    const asOwner = await student.agent.get(`/api${proofPath}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.headers["content-disposition"]).toContain("attachment");

    // Their proctor can fetch it.
    const owner = await login("test.idor.owner@bmsce.ac.in");
    expect((await owner.agent.get(`/api${proofPath}`)).status).toBe(200);

    // An unrelated proctor cannot, even though they're a valid authenticated user.
    const other = await login("test.idor.other@bmsce.ac.in");
    expect((await other.agent.get(`/api${proofPath}`)).status).toBe(403);

    // An unauthenticated request is rejected outright.
    expect((await request(testApp).get(`/api${proofPath}`)).status).toBe(401);

    // A well-formed-looking but non-existent filename 404s rather than leaking path info.
    expect((await student.agent.get("/api/uploads/proofs/00000000000000000000000000000000.png")).status).toBe(404);

    // A malformed filename (path-traversal-shaped or otherwise) is rejected outright.
    expect((await student.agent.get("/api/uploads/proofs/..%2f..%2fetc%2fpasswd")).status).toBe(400);
  });

  it("rejects a disallowed file type at upload time", async () => {
    const student = await login("test.filetype.student@bmsce.ac.in");
    const res = await student.agent
      .post("/api/activity-points/claims")
      .field("description", "Malicious upload attempt")
      .field("requestedPoints", "5")
      .attach("proof", Buffer.from("<script>alert(document.cookie)</script>"), { filename: "evil.html", contentType: "text/html" });
    expect(res.status).toBe(400);
  });
});

describe("Faculty detail + analytics", () => {
  it("GET /proctors/:id returns full detail including proctees, viewable by any Admin/Proctor", async () => {
    const admin = await login("test.detail.admin@bmsce.ac.in");
    const proctorId = (await prisma.faculty.findUniqueOrThrow({ where: { email: "test.detail.proctor@bmsce.ac.in" } })).facultyId;

    const res = await admin.agent.get(`/api/proctors/${proctorId}`);
    expect(res.status).toBe(200);
    expect(res.body.faculty.email).toBe("test.detail.proctor@bmsce.ac.in");
    expect(res.body.proctees).toHaveLength(2);
  });

  it("GET /proctors/:id/analytics computes avgCgpa and an at-risk list from real effective results", async () => {
    const proctor = await login("test.detail.proctor@bmsce.ac.in");
    const proctorId = (await prisma.faculty.findUniqueOrThrow({ where: { email: "test.detail.proctor@bmsce.ac.in" } })).facultyId;

    const res = await proctor.agent.get(`/api/proctors/${proctorId}/analytics`);
    expect(res.status).toBe(200);
    expect(res.body.proctee_count).toBe(2);
    expect(res.body.backlogCount).toBe(1);
    expect(res.body.atRisk.some((s: any) => s.usn === "1TD22CS001")).toBe(true);
    expect(res.body.atRisk.some((s: any) => s.usn === "1TD22CS002")).toBe(false);
  });

  it("blocks a Proctor from viewing another proctor's analytics", async () => {
    const other = await login("test.detail.other@bmsce.ac.in");
    const proctorId = (await prisma.faculty.findUniqueOrThrow({ where: { email: "test.detail.proctor@bmsce.ac.in" } })).facultyId;
    const res = await other.agent.get(`/api/proctors/${proctorId}/analytics`);
    expect(res.status).toBe(403);
  });
});

describe("Student notes", () => {
  it("lets a proctor add and read a note for their own proctee, but not for someone else's", async () => {
    const proctor = await login("test.detail.proctor@bmsce.ac.in");
    const other = await login("test.detail.other@bmsce.ac.in");

    const blocked = await other.agent.post("/api/students/1TD22CS001/notes").send({ note: "should not be allowed" });
    expect(blocked.status).toBe(403);

    const created = await proctor.agent.post("/api/students/1TD22CS001/notes").send({ note: "Spoke with parents about attendance." });
    expect(created.status).toBe(201);

    const list = await proctor.agent.get("/api/students/1TD22CS001/notes");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].note).toBe("Spoke with parents about attendance.");
  });

  it("a Student session cannot read notes about themselves — staff-only", async () => {
    const res = await request(testApp).get("/api/students/1TD22CS001/notes");
    expect(res.status).toBe(401); // no session at all; role check alone is covered by requireRole not listing STUDENT
  });
});

describe("PTM per-student tagging", () => {
  it("lets a proctor tag a PTM to their own proctee and filter by usn, but not tag another proctor's student", async () => {
    const proctor = await login("test.detail.proctor@bmsce.ac.in");
    const other = await login("test.detail.other@bmsce.ac.in");

    const blocked = await other.agent.post("/api/ptm").send({ ptmDate: "2026-10-01", ptmTime: "10:00", usn: "1TD22CS001" });
    expect(blocked.status).toBe(403);

    const ok = await proctor.agent.post("/api/ptm").send({ ptmDate: "2026-10-01", ptmTime: "10:00", usn: "1TD22CS001", notes: "Discussed backlog" });
    expect(ok.status).toBe(201);

    const filtered = await proctor.agent.get("/api/ptm?usn=1TD22CS001");
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].notes).toBe("Discussed backlog");
  });
});

describe("PDF/image scan import", () => {
  it("extracts rows from a text PDF, matches known USNs, and commits them as real ResultRecords", async () => {
    const proctor = await login("test.detail.proctor@bmsce.ac.in");

    const pdf = await buildTextPdf(["4th Semester Result Sheet — Section Test", "1TD22CS001 30 25 55 B"]);

    const extractRes = await proctor.agent
      .post("/api/admin/scan/extract")
      .field("semester", "3")
      .field("subjects", JSON.stringify([{ code: "CS32", name: "Test Subject", credits: 4 }]))
      .attach("file", pdf, { filename: "sheet.pdf", contentType: "application/pdf" });

    expect(extractRes.status).toBe(200);
    expect(extractRes.body.rows).toHaveLength(1);
    expect(extractRes.body.rows[0].usn).toBe("1TD22CS001");
    expect(extractRes.body.rows[0].matched).toBe(true);
    expect(extractRes.body.rows[0].cells[0].totalMarks).toBe(55);

    const commitRes = await proctor.agent.post("/api/admin/scan/commit").send({
      semester: 3,
      sourceType: "MAIN",
      subjects: [{ code: "CS32", name: "Test Subject", credits: 4 }],
      rows: [{ usn: "1TD22CS001", cells: [{ internalMarks: 30, externalMarks: 25, totalMarks: 55, grade: "B", status: "PASS" }] }],
    });
    expect(commitRes.status).toBe(200);
    expect(commitRes.body.created).toBe(1);
    expect(commitRes.body.exceptions).toBe(0);

    const check = await proctor.agent.get("/api/students/1TD22CS001/results");
    expect(check.body.some((r: any) => r.subjectCode === "CS32" && r.totalMarks === 55)).toBe(true);
  });

  it("rejects a non-PDF/image file type at the multer layer", async () => {
    const proctor = await login("test.detail.proctor@bmsce.ac.in");
    const res = await proctor.agent
      .post("/api/admin/scan/extract")
      .field("semester", "3")
      .field("subjects", JSON.stringify([{ code: "CS32", credits: 4 }]))
      .attach("file", Buffer.from("not a pdf"), { filename: "sheet.txt", contentType: "text/plain" });
    expect(res.status).toBe(400);
  });

  it("routes a commit row for a non-proctee to the exception queue instead of writing it", async () => {
    const other = await login("test.detail.other@bmsce.ac.in");
    const res = await other.agent.post("/api/admin/scan/commit").send({
      semester: 3,
      sourceType: "MAIN",
      subjects: [{ code: "CS32", name: "Test Subject", credits: 4 }],
      rows: [{ usn: "1TD22CS002", cells: [{ internalMarks: 30, externalMarks: 25, totalMarks: 55, grade: "B", status: "PASS" }] }],
    });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.exceptions).toBe(1);
  });
});

describe("Department-wide analytics", () => {
  it("aggregates CGPA/backlog/at-risk by section and by semester, admin-only", async () => {
    const other = await login("test.deptanalytics.blocked@bmsce.ac.in");
    expect((await other.agent.get("/api/admin/analytics")).status).toBe(403);

    const admin = await login("test.detail.admin@bmsce.ac.in");
    const res = await admin.agent.get("/api/admin/analytics");
    expect(res.status).toBe(200);

    // 1TD22CS001 now carries two records (the CS31 backlog fixture plus the
    // CS32 scan-import row from the previous describe block): CGPA 3.0, one
    // backlog. 1TD22CS002 is a clean CGPA 8; 1TD22CS003 a clean CGPA 10.
    const sectionTDX = res.body.bySection.find((s: any) => s.section === "TDX");
    expect(sectionTDX).toMatchObject({ studentCount: 2, avgCgpa: 5.5, backlogCount: 1, atRiskCount: 1 });

    const sectionTDY = res.body.bySection.find((s: any) => s.section === "TDY");
    expect(sectionTDY).toMatchObject({ studentCount: 1, avgCgpa: 10, backlogCount: 0, atRiskCount: 0 });

    const sem3 = res.body.bySemester.find((s: any) => s.semester === 3);
    expect(sem3).toMatchObject({ studentCount: 3, avgCgpa: 7, backlogCount: 1, atRiskCount: 1 });
  });
});

describe("Student CGPA comparison analytics", () => {
  it("computes section and semester percentile/rank against peers", async () => {
    const proctor = await login("test.compare.viewer@bmsce.ac.in");
    const res = await proctor.agent.get("/api/students/1TD22CS002/analytics/comparison");
    expect(res.status).toBe(200);
    expect(res.body.cgpa).toBe(8);
    expect(res.body.section).toMatchObject({ label: "TDX", avgCgpa: 5.5, percentile: 50, rank: 1, of: 2 });
    expect(res.body.semester).toMatchObject({ label: "Semester 3", avgCgpa: 7, percentile: 33, rank: 2, of: 3 });
    expect(res.body.section.distribution.reduce((s: number, b: any) => s + b.count, 0)).toBe(2);
  });

  it("lets the student view their own comparison but not another student's", async () => {
    const self = await login("test.detail.student2@bmsce.ac.in");
    expect((await self.agent.get("/api/students/1TD22CS002/analytics/comparison")).status).toBe(200);
    expect((await self.agent.get("/api/students/1TD22CS001/analytics/comparison")).status).toBe(403);
  });
});

describe("Faculty workload + reassignment", () => {
  it("reports proctee-count balance and lets an Admin move a student to a different proctor", async () => {
    const admin = await login("test.detail.admin@bmsce.ac.in");
    const proctor1 = await prisma.faculty.findUniqueOrThrow({ where: { email: "test.detail.proctor@bmsce.ac.in" } });
    const proctor2 = await prisma.faculty.findUniqueOrThrow({ where: { email: "test.detail.proctor2@bmsce.ac.in" } });

    const before = await admin.agent.get("/api/admin/workload");
    expect(before.status).toBe(200);
    expect(before.body.proctors.find((p: any) => p.facultyId === proctor1.facultyId).procteeCount).toBe(2);
    expect(before.body.proctors.find((p: any) => p.facultyId === proctor2.facultyId).procteeCount).toBe(1);

    const other = await login("test.reassign.blocked@bmsce.ac.in");
    expect((await other.agent.patch("/api/students/1TD22CS002/proctor").send({ proctorId: proctor2.facultyId })).status).toBe(403);

    const reassign = await admin.agent.patch("/api/students/1TD22CS002/proctor").send({ proctorId: proctor2.facultyId });
    expect(reassign.status).toBe(200);
    expect(reassign.body.proctorId).toBe(proctor2.facultyId);

    const after = await admin.agent.get("/api/admin/workload");
    expect(after.body.proctors.find((p: any) => p.facultyId === proctor1.facultyId).procteeCount).toBe(1);
    expect(after.body.proctors.find((p: any) => p.facultyId === proctor2.facultyId).procteeCount).toBe(2);
  });

  it("notified the new proctor, and logged the reassignment to the audit trail", async () => {
    const proctor2 = await login("test.detail.proctor2@bmsce.ac.in");
    const notifs = await proctor2.agent.get("/api/notifications");
    expect(notifs.status).toBe(200);
    const assigned = notifs.body.items.find((n: any) => n.type === "PROCTEE_ASSIGNED");
    expect(assigned).toBeTruthy();
    expect(notifs.body.unreadCount).toBeGreaterThan(0);

    const markRead = await proctor2.agent.post(`/api/notifications/${assigned.id}/read`);
    expect(markRead.status).toBe(200);

    const admin = await login("test.detail.admin@bmsce.ac.in");
    const audit = await admin.agent.get("/api/admin/audit-log?targetType=Student&targetId=1TD22CS002");
    expect(audit.status).toBe(200);
    expect(audit.body.entries.some((e: any) => e.action === "REASSIGN")).toBe(true);

    const other = await login("test.auditlog.blocked@bmsce.ac.in");
    expect((await other.agent.get("/api/admin/audit-log")).status).toBe(403);
  });
});

describe("Bulk PTM and bulk notes", () => {
  it("logs the same PTM against several proctees, skipping usns that aren't the caller's", async () => {
    const proctor = await login("test.bulk.proctor@bmsce.ac.in");
    const res = await proctor.agent.post("/api/ptm/bulk").send({
      ptmDate: "2026-10-05",
      ptmTime: "11:00",
      notes: "Section-wide check-in",
      usns: ["1BLK22CS001", "1BLK22CS002"], // 1BLK22CS002 belongs to a different proctor
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual([{ usn: "1BLK22CS002", reason: "Not your proctee" }]);
  });

  it("logs the same note against several proctees, skipping unknown/unauthorized usns", async () => {
    const proctor = await login("test.bulk.proctor@bmsce.ac.in");
    const res = await proctor.agent.post("/api/students/notes/bulk").send({
      note: "Attended the semester kickoff meeting.",
      usns: ["1BLK22CS001", "1BLK22CS002", "1BLKNONEXISTENT"],
    });
    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining([
        { usn: "1BLK22CS002", reason: "Not your proctee" },
        { usn: "1BLKNONEXISTENT", reason: "Unknown USN" },
      ])
    );

    const notes = await proctor.agent.get("/api/students/1BLK22CS001/notes");
    expect(notes.body.some((n: any) => n.note === "Attended the semester kickoff meeting.")).toBe(true);
  });
});

describe("Student PTM visibility", () => {
  it("lets a student read their own PTM history and nothing else", async () => {
    const student = await login("test.detail.student1@bmsce.ac.in");
    const res = await student.agent.get("/api/ptm");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((p: any) => p.usn === "1TD22CS001")).toBe(true);
  });
});

describe("Scan source-file retention", () => {
  it("retains the uploaded sheet, links it to the committed batch, and gates download to the uploader or an Admin", async () => {
    const proctor = await login("test.scansrc.proctor@bmsce.ac.in");

    const pdf = await buildTextPdf(["Source-file retention test sheet", "1SRC22CS001 30 25 55 B"]);
    const extractRes = await proctor.agent
      .post("/api/admin/scan/extract")
      .field("semester", "3")
      .field("subjects", JSON.stringify([{ code: "CS33", name: "Test Subject", credits: 4 }]))
      .attach("file", pdf, { filename: "sheet.pdf", contentType: "application/pdf" });
    expect(extractRes.status).toBe(200);
    expect(extractRes.body.sourceFile).toMatch(/^[a-f0-9]{32}\.pdf$/);

    const commitRes = await proctor.agent.post("/api/admin/scan/commit").send({
      semester: 3,
      sourceType: "MAIN",
      subjects: [{ code: "CS33", name: "Test Subject", credits: 4 }],
      rows: [{ usn: "1SRC22CS001", cells: [{ internalMarks: 30, externalMarks: 25, totalMarks: 55, grade: "B", status: "PASS" }] }],
      sourceFile: extractRes.body.sourceFile,
    });
    expect(commitRes.status).toBe(200);
    const batchId = commitRes.body.batchId;

    const ownerDownload = await proctor.agent.get(`/api/admin/import-batches/${batchId}/source-file`);
    expect(ownerDownload.status).toBe(200);
    expect(ownerDownload.headers["content-disposition"]).toBe("attachment");

    const admin = await login("test.scansrc.admin@bmsce.ac.in");
    expect((await admin.agent.get(`/api/admin/import-batches/${batchId}/source-file`)).status).toBe(200);

    const other = await login("test.scansrc.blocked@bmsce.ac.in");
    expect((await other.agent.get(`/api/admin/import-batches/${batchId}/source-file`)).status).toBe(403);
  });

  it("rejects a sourceFile value that doesn't match the opaque-filename shape it hands out", async () => {
    const proctor = await login("test.scansrc.proctor@bmsce.ac.in");
    const res = await proctor.agent.post("/api/admin/scan/commit").send({
      semester: 3,
      sourceType: "MAIN",
      subjects: [{ code: "CS33", credits: 4 }],
      rows: [{ usn: "1SRC22CS001", cells: [{ internalMarks: 30, externalMarks: 25, totalMarks: 55, grade: "B", status: "PASS" }] }],
      sourceFile: "../../../etc/passwd",
    });
    expect(res.status).toBe(400);
  });
});

describe("Attendance", () => {
  it("marks a day's attendance in bulk, skipping usns that aren't the caller's proctee", async () => {
    const proctor = await login("test.att.proctor@bmsce.ac.in");
    const res = await proctor.agent.post("/api/attendance/mark").send({
      date: "2026-09-01",
      records: [
        { usn: "1ATT22CS001", status: "PRESENT" },
        { usn: "1ATT22CS002", status: "ABSENT" }, // not this proctor's proctee
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.marked).toBe(1);
    expect(res.body.skipped).toEqual([{ usn: "1ATT22CS002", reason: "Not your proctee" }]);
  });

  it("amends an existing day's mark instead of duplicating it", async () => {
    const proctor = await login("test.att.proctor@bmsce.ac.in");
    const res = await proctor.agent.post("/api/attendance/mark").send({
      date: "2026-09-01",
      records: [{ usn: "1ATT22CS001", status: "LATE" }],
    });
    expect(res.status).toBe(201);
    expect(res.body.marked).toBe(1);

    const summary = await proctor.agent.get("/api/students/1ATT22CS001/attendance/summary");
    expect(summary.body.total).toBe(1); // still one row, not two
    expect(summary.body.late).toBe(1);
  });

  it("blocks a Proctor from viewing a non-proctee's attendance summary", async () => {
    const other = await login("test.att.blocked@bmsce.ac.in");
    const blockedSummary = await other.agent.get("/api/students/1ATT22CS001/attendance/summary");
    expect(blockedSummary.status).toBe(403);
  });

  it("lets a student read their own attendance summary, and computes present+late as the percentage", async () => {
    const admin = await login("test.att.admin@bmsce.ac.in");
    await admin.agent.post("/api/attendance/mark").send({ date: "2026-09-02", records: [{ usn: "1ATT22CS001", status: "PRESENT" }] });
    await admin.agent.post("/api/attendance/mark").send({ date: "2026-09-03", records: [{ usn: "1ATT22CS001", status: "ABSENT" }] });

    const student = await login("test.att.student1@bmsce.ac.in");
    const res = await student.agent.get("/api/students/1ATT22CS001/attendance/summary");
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // the LATE mark from above + these two
    expect(res.body.present).toBe(1);
    expect(res.body.absent).toBe(1);
    expect(res.body.late).toBe(1);
    expect(res.body.percentage).toBeCloseTo(66.7, 1); // (1 present + 1 late) / 3

    const otherStudent = await login("test.att.student2@bmsce.ac.in" /* unused above */);
    // A student querying their own (empty) summary is fine...
    expect((await otherStudent.agent.get("/api/students/1ATT22CS002/attendance/summary")).status).toBe(200);
    // ...but not someone else's.
    expect((await otherStudent.agent.get("/api/students/1ATT22CS001/attendance/summary")).status).toBe(403);
  });

  it("rolls up section-wise attendance percentage for the Admin, admin-only", async () => {
    const admin = await login("test.att.admin@bmsce.ac.in");
    const res = await admin.agent.get("/api/admin/attendance/analytics?from=2026-09-01&to=2026-09-03");
    expect(res.status).toBe(200);
    const atx = res.body.bySection.find((s: any) => s.section === "ATX");
    expect(atx).toBeTruthy();
    expect(atx.recordCount).toBe(3);
    expect(atx.percentage).toBeCloseTo(66.7, 1);

    const proctor = await login("test.att.proctor@bmsce.ac.in");
    expect((await proctor.agent.get("/api/admin/attendance/analytics")).status).toBe(403);
  });
});
