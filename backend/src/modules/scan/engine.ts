import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

/**
 * Minimum characters of extracted text before we trust a PDF has a real text
 * layer. Below this, treat it as a pure image scan — rasterizing a PDF page
 * to an image reliably (pdfjs-dist + node canvas) turned out not to work in
 * this environment (blank renders, no runtime error to catch), so rather
 * than silently return nothing, PDFs without enough text ask the caller to
 * upload the page as an image instead, which OCRs directly and reliably.
 */
const MIN_TEXT_LAYER_CHARS = 40;

export interface ExtractResult {
  text: string;
  source: "pdf-text" | "ocr";
}

export class NoTextLayerError extends Error {
  constructor() {
    super("This PDF has no extractable text layer (it's a pure image scan). Save/export the page as a JPEG or PNG and upload that instead — image uploads are OCR'd directly.");
    this.name = "NoTextLayerError";
  }
}

/** Text-layer extraction for a digitally-produced (or already-OCR'd-upstream) PDF. pdf-parse's getText() already walks every page and concatenates them, so a multi-page result sheet is read in full, not just page 1. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy?.();
  }
}

/** OCR for an uploaded image (JPEG/PNG/WEBP) — a scanned or photographed result sheet. */
export async function ocrImage(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buffer);
    return cleanOcrText(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR-specific noise cleanup — table borders and rule lines Tesseract reads
 * as stray "|"/"_"/"—" characters, and the handful of character confusions
 * (fullwidth/typographic punctuation) that show up around numbers/grades on
 * a photographed sheet but never in a real PDF text layer, so this only runs
 * on the OCR path.
 */
function cleanOcrText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[|_]+/g, " ")
        .replace(/[‐-‒–—―]/g, "-")
        .replace(/[^\S\r\n]+/g, " ")
        .trim()
    )
    .join("\n");
}

/** Routes a PDF upload to text extraction, throwing NoTextLayerError if it turns out to be image-only. */
export async function extractFromPdf(buffer: Buffer): Promise<ExtractResult> {
  const text = await extractPdfText(buffer);
  if (text.trim().length < MIN_TEXT_LAYER_CHARS) throw new NoTextLayerError();
  return { text, source: "pdf-text" };
}

export interface SubjectDef {
  code: string;
  name?: string;
  credits: number;
}

export interface ParsedCell {
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number | null;
  grade: string | null;
  status: "PASS" | "FAIL" | "WITHHELD" | "ABSENT";
  raw: string; // the tokens as read for this cell, for the review UI to show what was actually seen
}

export interface ParsedRow {
  usn: string;
  lineNumber: number;
  cells: ParsedCell[];
  ok: boolean; // false if the row couldn't be anchored cleanly — needs manual review
  rawLine: string;
}

export interface ParseSummary {
  rows: ParsedRow[];
  unparsedLines: { lineNumber: number; text: string }[];
}

// A VTU-style USN: 1 digit, 2 letters (college code), 2 digits (year), 2
// letters (branch), 3 digits (roll) — e.g. "1WA24CS153", "1BM22CS001".
const USN_PATTERN = /\b\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}\b/;

// A single result-sheet cell is either a number, or one of these markers
// (see resultsData.ts's own note: NE = not eligible to sit, AB = absent,
// blank/"I" = incomplete/withheld). Grade tokens are 1-2 letters optionally
// followed by "+". NE/AB/DX/I can appear in EITHER the marks position (e.g.
// SEE="NE") or the grade position (grade="AB"/"DX"/"I") — real sheets use
// the same marker both ways, which is why both regexes below overlap on them.
const NUMERIC_OR_MARKER = /^(\d+(?:\.\d+)?|NE|AB|DX|I)$/i;
const GRADE_TOKEN = /^(O|A\+|A|B\+|B|C|P|F|DX|AB|I|NE)$/i;

function tokenToNumberOrNull(tok: string | null): number | null {
  if (tok === null) return null;
  const n = Number(tok);
  return Number.isFinite(n) ? n : null;
}

function statusFor(grade: string | null, marksAllPresent: boolean): ParsedCell["status"] {
  const g = (grade ?? "").toUpperCase();
  if (g === "AB") return "ABSENT";
  if (g === "DX" || g === "I" || g === "NE") return "WITHHELD";
  if (g === "F") return "FAIL";
  if (!marksAllPresent && !g) return "WITHHELD";
  return "PASS";
}

function buildCell(cieTok: string | null, seeTok: string | null, totalTok: string | null, gradeTok: string): ParsedCell {
  const internalMarks = tokenToNumberOrNull(cieTok);
  const externalMarks = tokenToNumberOrNull(seeTok);
  const totalMarks = tokenToNumberOrNull(totalTok);
  const grade = gradeTok.toUpperCase();
  return {
    internalMarks,
    externalMarks,
    totalMarks,
    grade,
    status: statusFor(grade, internalMarks !== null && externalMarks !== null && totalMarks !== null),
    raw: [cieTok, seeTok, totalTok, gradeTok].filter((t) => t !== null).join(" "),
  };
}

/**
 * Consumes the token stream sequentially, subject by subject: CIE, then SEE,
 * then — unless `neSkipsTotal` and SEE reads "NE" — TOTAL, then GRADE. Fails
 * (returns null) unless this exactly accounts for every token in the row: no
 * leftover, no shortfall, and every consumed grade slot actually looks like
 * a grade. That "exact accounting" check is what makes this trustworthy —
 * a wrong guess about the row's shape runs out of tokens or leaves some
 * over, rather than silently misreading values.
 */
function tryConsumeSequential(tokens: string[], subjectCount: number, neSkipsTotal: boolean): ParsedCell[] | null {
  const cells: ParsedCell[] = [];
  let i = 0;
  for (let s = 0; s < subjectCount; s++) {
    if (i >= tokens.length) return null;
    const cieTok = tokens[i++];
    if (i >= tokens.length) return null;
    const seeTok = tokens[i++];

    let totalTok: string | null = null;
    if (!(neSkipsTotal && seeTok.toUpperCase() === "NE")) {
      if (i >= tokens.length) return null;
      totalTok = tokens[i++];
    }

    if (i >= tokens.length) return null;
    const gradeTok = tokens[i++];
    if (!GRADE_TOKEN.test(gradeTok)) return null;

    cells.push(buildCell(cieTok, seeTok, totalTok, gradeTok));
  }
  return i === tokens.length ? cells : null;
}

/**
 * Splits one row's token stream into per-subject cells. A blind flat-chunk
 * split (always 4 tokens per subject) breaks the moment any single cell
 * renders blank on the sheet — which happens routinely here: TOTAL is
 * mathematically undefined (not just omitted) when SEE = "NE" ("not
 * eligible to sit the exam"), since TOTAL = CIE + SEE. But the real sheet
 * this was built against turns out to be inconsistent about whether that
 * blank is actually left blank or backfilled with TOTAL = CIE — sometimes
 * within the very same sheet — so there is no single fixed rule that's
 * always right. Both conventions are tried (NE-blanks-TOTAL first, since
 * that's what "not eligible" actually means; NE-keeps-TOTAL as the
 * fallback), and whichever one exactly accounts for every token in the row
 * is used. If neither does, the caller falls back to a best-effort flat
 * chunk and flags the row `ok: false` for manual review — an honest "this
 * one needs a human" rather than a confident wrong guess.
 */
function parseSubjectCells(tokens: string[], subjectCount: number): ParsedCell[] | null {
  return tryConsumeSequential(tokens, subjectCount, true) ?? tryConsumeSequential(tokens, subjectCount, false);
}

/** Best-effort fallback when grade-anchoring didn't find exactly `subjectCount` grades — the pre-anchoring behaviour, flagged not-ok for manual review either way. */
function parseByFlatChunks(tokens: string[], subjectCount: number): ParsedCell[] {
  const cells: ParsedCell[] = [];
  for (let i = 0; i < subjectCount; i++) {
    const chunk = tokens.slice(i * 4, i * 4 + 4);
    const [cieTok, seeTok, totalTok, gradeTok] = [chunk[0] ?? null, chunk[1] ?? null, chunk[2] ?? null, chunk[3] ?? null];
    cells.push(buildCell(cieTok, seeTok, totalTok, gradeTok ?? ""));
  }
  return cells;
}

function extractRowTokens(afterUsn: string): string[] {
  return afterUsn
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && (NUMERIC_OR_MARKER.test(t) || GRADE_TOKEN.test(t)));
}

/**
 * Heuristic row extractor: finds a USN on a line, reads the rest of that
 * line (and, if the row looks cut short, the next line too — a table row
 * that wrapped across a page or column break) as one flat token stream, then
 * anchors it into per-subject cells on the grade tokens (see
 * parseByGradeAnchors). A row is only flagged `ok: false` when anchoring
 * itself failed — not merely because a cell came back blank, since a blank
 * TOTAL/SEE is a real, expected value on this sheet (NE/AB/detained rows),
 * not a parse failure.
 */
export function parseResultRows(text: string, subjects: SubjectDef[]): ParseSummary {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const unparsedLines: { lineNumber: number; text: string }[] = [];
  const rowsByUsn = new Map<string, number>(); // usn -> index into rows[], for de-duplication
  const consumed = new Set<number>(); // line indices folded into the previous row as a continuation

  for (let idx = 0; idx < lines.length; idx++) {
    if (consumed.has(idx)) continue;
    const line = lines[idx];
    const usnMatch = line.match(USN_PATTERN);
    if (!usnMatch) continue;

    const usn = usnMatch[0].toUpperCase();
    const afterUsn = line.slice(usnMatch.index! + usnMatch[0].length);
    let tokens = extractRowTokens(afterUsn);
    let rawLine = line.trim();

    // A row that doesn't parse cleanly might just be wrapped onto the next
    // physical line (common at a page/column break) rather than genuinely
    // malformed — fold the next line in only if doing so makes it parse
    // cleanly, and only if that next line isn't itself the start of another
    // student's row.
    if (tokens.length > 0 && parseSubjectCells(tokens, subjects.length) === null && idx + 1 < lines.length) {
      const nextLine = lines[idx + 1];
      if (!USN_PATTERN.test(nextLine)) {
        const nextTokens = extractRowTokens(nextLine);
        const combined = [...tokens, ...nextTokens];
        if (nextTokens.length > 0 && parseSubjectCells(combined, subjects.length) !== null) {
          tokens = combined;
          rawLine = `${rawLine} ${nextLine.trim()}`;
          consumed.add(idx + 1);
        }
      }
    }

    if (tokens.length === 0) {
      unparsedLines.push({ lineNumber: idx + 1, text: line });
      continue;
    }

    const anchored = parseSubjectCells(tokens, subjects.length);
    const ok = anchored !== null;
    const cells = anchored ?? parseByFlatChunks(tokens, subjects.length);

    const row: ParsedRow = { usn, lineNumber: idx + 1, cells, ok, rawLine };

    // A duplicate USN (repeated table header + carried-over row, the same
    // page scanned/uploaded twice, ...) — prefer whichever parse is `ok`,
    // and otherwise keep the later occurrence.
    const existingIdx = rowsByUsn.get(usn);
    if (existingIdx === undefined) {
      rowsByUsn.set(usn, rows.length);
      rows.push(row);
    } else if (!rows[existingIdx].ok || row.ok) {
      rows[existingIdx] = row;
    }
  }

  return { rows, unparsedLines };
}
