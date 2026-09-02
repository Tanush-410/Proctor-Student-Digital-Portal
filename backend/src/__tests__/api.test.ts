import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
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

beforeAll(async () => {
  // Tables in FK-safe delete order.
  await prisma.importException.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.activityPointClaim.deleteMany();
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
