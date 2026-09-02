import { describe, expect, it } from "vitest";
import { ResultRecord } from "@prisma/client";
import { computeCGPA, computeSGPA, getBacklogSubjects, resolvePrecedence } from "./engine";

let nextId = 1;
function record(overrides: Partial<ResultRecord>): ResultRecord {
  return {
    resultId: nextId++,
    usn: "1BM22CS001",
    subjectCode: "CS51",
    subjectName: null,
    semester: 5,
    sourceType: "MAIN",
    internalMarks: null,
    externalMarks: null,
    totalMarks: null,
    credits: 4,
    grade: "A",
    status: "PASS",
    proofFile: null,
    uploadedBy: null,
    uploadedAt: new Date(),
    ...overrides,
  };
}

describe("resolvePrecedence", () => {
  it("picks CHALLENGE_REVAL over everything else for the same subject", () => {
    const records = [
      record({ sourceType: "MAIN", grade: "F", status: "FAIL", totalMarks: 30 }),
      record({ sourceType: "REVAL", grade: "C", status: "PASS", totalMarks: 45 }),
      record({ sourceType: "CHALLENGE_REVAL", grade: "B", status: "PASS", totalMarks: 55 }),
    ];
    const [result] = resolvePrecedence(records);
    expect(result.effective.sourceType).toBe("CHALLENGE_REVAL");
    expect(result.effective.totalMarks).toBe(55);
  });

  it("lets a SUPPLEMENTARY pass override an original MAIN fail", () => {
    const records = [
      record({ sourceType: "MAIN", grade: "F", status: "FAIL" }),
      record({ sourceType: "SUPPLEMENTARY", grade: "C", status: "PASS" }),
    ];
    const [result] = resolvePrecedence(records);
    expect(result.effective.sourceType).toBe("SUPPLEMENTARY");
    expect(result.effective.status).toBe("PASS");
  });

  it("only falls back to a STUDENT_PROVISIONAL entry when no official record exists", () => {
    const [withOnlyProvisional] = resolvePrecedence([record({ sourceType: "STUDENT_PROVISIONAL", grade: "A" })]);
    expect(withOnlyProvisional.effective.sourceType).toBe("STUDENT_PROVISIONAL");

    const [withOfficial] = resolvePrecedence([
      record({ sourceType: "STUDENT_PROVISIONAL", grade: "A" }),
      record({ sourceType: "MAIN", grade: "B+" }),
    ]);
    expect(withOfficial.effective.sourceType).toBe("MAIN");
  });

  it("groups independently per (usn, subject, semester)", () => {
    const records = [
      record({ usn: "1BM22CS001", subjectCode: "CS51" }),
      record({ usn: "1BM22CS001", subjectCode: "CS52" }),
      record({ usn: "1BM22CS002", subjectCode: "CS51" }),
    ];
    const results = resolvePrecedence(records);
    expect(results).toHaveLength(3);
  });

  it("flags a discrepancy when a student's provisional entry disagrees with the official result", () => {
    const agree = resolvePrecedence([
      record({ sourceType: "STUDENT_PROVISIONAL", grade: "A", totalMarks: 80 }),
      record({ sourceType: "MAIN", grade: "A", totalMarks: 80 }),
    ]);
    expect(agree[0].discrepancy).toBe(false);

    const disagree = resolvePrecedence([
      record({ sourceType: "STUDENT_PROVISIONAL", grade: "A", totalMarks: 80 }),
      record({ sourceType: "MAIN", grade: "B+", totalMarks: 72 }),
    ]);
    expect(disagree[0].discrepancy).toBe(true);
    // The official result still wins even though it's flagged as a discrepancy.
    expect(disagree[0].effective.sourceType).toBe("MAIN");
  });

  it("does not flag a discrepancy when there's no provisional entry to compare", () => {
    const [result] = resolvePrecedence([record({ sourceType: "MAIN" })]);
    expect(result.discrepancy).toBe(false);
  });
});

describe("computeSGPA / computeCGPA", () => {
  it("computes a credit-weighted average for one semester", () => {
    const effective = resolvePrecedence([
      record({ subjectCode: "CS51", semester: 5, grade: "O", credits: 4 }), // 10 * 4 = 40
      record({ subjectCode: "CS52", semester: 5, grade: "B", credits: 3 }), // 6 * 3 = 18
    ]);
    // (40 + 18) / 7 = 8.2857...
    expect(computeSGPA(effective, 5)).toBeCloseTo(8.29, 1);
  });

  it("returns null SGPA for a semester with no credits", () => {
    const effective = resolvePrecedence([record({ semester: 5, credits: 0 })]);
    expect(computeSGPA(effective, 5)).toBeNull();
  });

  it("computes CGPA across every semester's effective results", () => {
    const effective = resolvePrecedence([
      record({ subjectCode: "CS31", semester: 3, grade: "A", credits: 4 }), // 32
      record({ subjectCode: "CS51", semester: 5, grade: "O", credits: 4 }), // 40
    ]);
    // (32 + 40) / 8 = 9
    expect(computeCGPA(effective)).toBe(9);
  });

  it("an unrecognised or missing grade contributes zero points", () => {
    const effective = resolvePrecedence([record({ grade: null, credits: 4 })]);
    expect(computeSGPA(effective, 5)).toBe(0);
  });
});

describe("getBacklogSubjects", () => {
  it("includes only FAIL / WITHHELD / ABSENT effective results", () => {
    const effective = resolvePrecedence([
      record({ subjectCode: "CS51", status: "PASS" }),
      record({ subjectCode: "CS52", status: "FAIL" }),
      record({ subjectCode: "CS53", status: "WITHHELD" }),
      record({ subjectCode: "CS54", status: "ABSENT" }),
    ]);
    const backlog = getBacklogSubjects(effective).map((r) => r.subjectCode).sort();
    expect(backlog).toEqual(["CS52", "CS53", "CS54"]);
  });

  it("a cleared backlog (supplementary pass) is not reported as a backlog", () => {
    const effective = resolvePrecedence([
      record({ subjectCode: "CS53", sourceType: "MAIN", status: "FAIL" }),
      record({ subjectCode: "CS53", sourceType: "SUPPLEMENTARY", status: "PASS" }),
    ]);
    expect(getBacklogSubjects(effective)).toHaveLength(0);
  });
});
