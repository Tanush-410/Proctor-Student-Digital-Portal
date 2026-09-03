import { describe, expect, it } from "vitest";
import { parseResultRows, SubjectDef } from "./engine";

const SIX_SUBJECTS: SubjectDef[] = [
  { code: "23MA4BSLAO", credits: 3 },
  { code: "23CS4ESCRP", credits: 3 },
  { code: "23CS4PCTFC", credits: 4 },
  { code: "23CS4PCOPS", credits: 4 },
  { code: "23CS4PCADA", credits: 4 },
  { code: "23CS4PCSED", credits: 3 },
];

describe("parseResultRows", () => {
  it("reads a fully-populated row (every cell present) correctly", () => {
    const { rows } = parseResultRows("1WA24CS154 37 38 75 A 28 26 54 C 41 32 73 A 46 32 78 A 37 28 65 B+ 39 40 79 A", SIX_SUBJECTS);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.ok).toBe(true);
    expect(row.cells).toHaveLength(6);
    expect(row.cells[0]).toMatchObject({ internalMarks: 37, externalMarks: 38, totalMarks: 75, grade: "A", status: "PASS" });
    expect(row.cells[5]).toMatchObject({ internalMarks: 39, externalMarks: 40, totalMarks: 79, grade: "A" });
  });

  it("recovers a blank TOTAL when SEE is 'NE' instead of misaligning every subject after it (the real-world bug this rewrite fixes)", () => {
    // Real sheet row, from prisma/data/resultsData.ts's own transcription note:
    // "1WA24CS164": [[20,11,31,"F"],[20,"NE","","I"],[27,"NE","","I"],[38,"NE","","I"],[29,28,57,"B"],[32,"NE","","I"]]
    // — TOTAL is genuinely blank (no token at all) whenever SEE = "NE", so
    // the extracted text line has fewer than 4 tokens for those subjects.
    const line = "1WA24CS164 20 11 31 F 20 NE I 27 NE I 38 NE I 29 28 57 B 32 NE I";
    const { rows } = parseResultRows(line, SIX_SUBJECTS);
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.ok).toBe(true); // exact NE-blanks-TOTAL accounting of every token, not flagged for manual review
    expect(row.cells.map((c) => c.grade)).toEqual(["F", "I", "I", "I", "B", "I"]);

    // Subject 1: fully populated.
    expect(row.cells[0]).toMatchObject({ internalMarks: 20, externalMarks: 11, totalMarks: 31, grade: "F" });
    // Subjects 2-4: CIE + "NE" present, TOTAL genuinely blank — not shifted
    // into reading "NE" as the total or the next subject's CIE as this one's SEE.
    expect(row.cells[1]).toMatchObject({ internalMarks: 20, externalMarks: null, totalMarks: null, grade: "I" });
    expect(row.cells[2]).toMatchObject({ internalMarks: 27, externalMarks: null, totalMarks: null, grade: "I" });
    expect(row.cells[3]).toMatchObject({ internalMarks: 38, externalMarks: null, totalMarks: null, grade: "I" });
    // Subject 5: back to fully populated — proves recovery, not a permanent desync.
    expect(row.cells[4]).toMatchObject({ internalMarks: 29, externalMarks: 28, totalMarks: 57, grade: "B" });
    expect(row.cells[5]).toMatchObject({ internalMarks: 32, externalMarks: null, totalMarks: null, grade: "I" });
  });

  it("keeps TOTAL when NE is backfilled with TOTAL = CIE instead of left blank (the sheet is inconsistent about this — both conventions must work)", () => {
    // "1WA24CS155": [[12,"NE",12,"DX"],[7,"NE",7,"DX"],...] — same SEE="NE"
    // situation as the test above, but this sheet/row kept TOTAL = CIE
    // instead of leaving it blank. Falls back to the NE-keeps-TOTAL reading
    // since the NE-blanks-TOTAL reading doesn't exactly consume this row.
    const { rows } = parseResultRows("1WA24CS155 12 NE 12 DX 7 NE 7 DX", [
      { code: "S1", credits: 4 },
      { code: "S2", credits: 4 },
    ]);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].cells[0]).toMatchObject({ internalMarks: 12, externalMarks: null, totalMarks: 12, grade: "DX", status: "WITHHELD" });
    expect(rows[0].cells[1]).toMatchObject({ internalMarks: 7, externalMarks: null, totalMarks: 7, grade: "DX" });
  });

  it("keeps TOTAL when a student is merely ABSENT (SEE = 'AB' but TOTAL still printed)", () => {
    // "1WA24CS155": [[20,"AB",20,"AB"], ...] — an AB row always carries a
    // TOTAL (equal to CIE, since SEE contributes 0) — only NE is ambiguous.
    const { rows } = parseResultRows("1WA24CS155 20 AB 20 AB", [{ code: "S1", credits: 4 }]);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].cells[0]).toMatchObject({ internalMarks: 20, externalMarks: null, totalMarks: 20, grade: "AB", status: "ABSENT" });
  });

  it("folds a row that wrapped onto the next physical line back together", () => {
    const text = ["1WA24CS999 37 38 75 A 28 26 54 C 41 32 73 A", "46 32 78 A 37 28 65 B+ 39 40 79 A"].join("\n");
    const { rows } = parseResultRows(text, SIX_SUBJECTS);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].cells).toHaveLength(6);
    expect(rows[0].cells[5]).toMatchObject({ internalMarks: 39, externalMarks: 40, totalMarks: 79, grade: "A" });
  });

  it("does not fold the next line in if it starts its own USN row", () => {
    const text = ["1WA24CS001 37 38 75 A", "1WA24CS002 28 26 54 C"].join("\n");
    const { rows } = parseResultRows(text, [
      { code: "S1", credits: 4 },
      { code: "S2", credits: 4 },
    ]);
    expect(rows).toHaveLength(2);
    // Neither row completes to 2 subjects on its own, so both fall back to
    // flat-chunk and are flagged for review rather than folded together.
    expect(rows[0].ok).toBe(false);
    expect(rows[1].ok).toBe(false);
  });

  it("de-duplicates a repeated USN, preferring the cleanly-parsed occurrence", () => {
    const text = [
      "1WA24CS001 garbled row that fails to parse cleanly A", // malformed — falls back to flat chunk, ok:false
      "1WA24CS001 37 38 75 A", // clean re-read of the same student later in the sheet
    ].join("\n");
    const { rows } = parseResultRows(text, [{ code: "S1", credits: 4 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(true);
    expect(rows[0].cells[0]).toMatchObject({ totalMarks: 75, grade: "A" });
  });

  it("flags a row not-ok (but still returns it) when it can't be parsed cleanly", () => {
    const { rows } = parseResultRows("1WA24CS500 37 38 75", [
      { code: "S1", credits: 4 },
      { code: "S2", credits: 4 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].ok).toBe(false);
  });

  it("ignores a line with no USN entirely, and routes a USN with no readable marks to unparsedLines", () => {
    const text = ["Page 3 of 12 — continued", "1WA24CS777 —"].join("\n");
    const { rows, unparsedLines } = parseResultRows(text, [{ code: "S1", credits: 4 }]);
    expect(rows).toHaveLength(0);
    expect(unparsedLines).toHaveLength(1);
    expect(unparsedLines[0].text).toContain("1WA24CS777");
  });
});
