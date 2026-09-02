import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { joinOnEmail, normaliseKeys, parseSheet, requireEmailColumn } from "./engine";

function csvBuffer(rows: string[]): Buffer {
  return Buffer.from(rows.join("\n"), "utf-8");
}

describe("parseSheet", () => {
  it("parses a well-formed CSV into normalised rows", () => {
    const buf = csvBuffer(["usn,name,email", "1BM22CS001,Aarav Sharma,aarav@bmsce.ac.in"]);
    const { rows, errors } = parseSheet(buf);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([{ usn: "1BM22CS001", name: "Aarav Sharma", email: "aarav@bmsce.ac.in" }]);
  });

  it("does not require an e-mail column — that's the concern of specific callers, not the generic parser (regression: this once silently broke every results upload)", () => {
    const buf = csvBuffer(["usn,subject_code,semester", "1BM22CS001,CS51,5"]);
    const { rows, errors } = parseSheet(buf);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([{ usn: "1BM22CS001", subject_code: "CS51", semester: "5" }]);
  });

  it("preserves leading zeros in phone-number-like cells (regression: SheetJS numeric auto-detection)", () => {
    const buf = csvBuffer(["email,father_phone", "x@bmsce.ac.in,0000011111"]);
    const { rows } = parseSheet(buf);
    expect(rows[0].father_phone).toBe("0000011111");
  });

  it("also parses actual .xlsx workbooks, not just CSV", () => {
    const ws = XLSX.utils.aoa_to_sheet([["usn", "name", "email"], ["1BM22CS004", "Test Student", "test@bmsce.ac.in"]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const { rows, errors } = parseSheet(buf);
    expect(errors).toHaveLength(0);
    expect(rows[0].usn).toBe("1BM22CS004");
  });
});

describe("normaliseKeys", () => {
  it("lower-cases e-mail and trims/upper-cases usn and short code", () => {
    const [row] = normaliseKeys([{ email: "  Mixed.Case@BMSCE.ac.in ", usn: " 1bm22cs001 ", proctor_short_code: " ar " }]);
    expect(row.email).toBe("mixed.case@bmsce.ac.in");
    expect(row.usn).toBe("1BM22CS001");
    expect(row.proctor_short_code).toBe("ar");
  });
});

describe("requireEmailColumn", () => {
  it("filters out rows with no e-mail and reports their original row number", () => {
    const rows = [{ email: "a@bmsce.ac.in" }, { email: "" }, { email: "c@bmsce.ac.in" }];
    const result = requireEmailColumn(rows);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toEqual([{ row: 3, message: "Missing required column: email" }]);
  });
});

describe("joinOnEmail", () => {
  it("joins a class-list row to its admission-data counterpart by e-mail", () => {
    const classList = [{ usn: "1BM22CS001", name: "Aarav", email: "aarav@bmsce.ac.in" }];
    const admission = [{ email: "aarav@bmsce.ac.in", quota: "CET" }];
    const { matched, unmatched } = joinOnEmail(classList, admission);
    expect(unmatched).toHaveLength(0);
    expect(matched[0].quota).toBe("CET");
  });

  it("routes an unmatched row to the exception list instead of dropping it", () => {
    const classList = [{ usn: "1BM22CS001", name: "Aarav", email: "aarav@bmsce.ac.in" }];
    const { matched, unmatched } = joinOnEmail(classList, []);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].reason).toMatch(/no admission-data row/i);
  });

  it("routes a row missing usn/name to the exception list", () => {
    const { matched, unmatched } = joinOnEmail([{ usn: "", name: "", email: "x@bmsce.ac.in" }], []);
    expect(matched).toHaveLength(0);
    expect(unmatched[0].reason).toMatch(/missing usn or name/i);
  });
});
