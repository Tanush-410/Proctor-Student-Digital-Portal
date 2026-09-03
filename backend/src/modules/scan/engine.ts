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

/** Text-layer extraction for a digitally-produced (or already-OCR'd-upstream) PDF. */
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
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
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
  raw: string; // the 4 tokens as read, for the review UI to show what was actually seen
}

export interface ParsedRow {
  usn: string;
  lineNumber: number;
  cells: ParsedCell[];
  ok: boolean; // false if the token count didn't line up with subjects.length * 4 — needs manual review
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
// followed by "+".
const NUMERIC_OR_MARKER = /^(\d+(?:\.\d+)?|NE|AB|--?|I)$/i;
const GRADE_TOKEN = /^(O|A\+?|B\+?|C|P|F|DX|AB|I|NE)$/i;

function tokenToNumberOrNull(tok: string): number | null {
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

/**
 * Heuristic row extractor: finds a USN on a line, then reads every
 * subsequent whitespace-separated token on that same line as one flat
 * stream, grouping it into (subjects.length) chunks of 4 — [CIE, SEE, TOTAL,
 * GRADE] — matching the layout resultsData.ts documents for the real result
 * sheet. Deliberately conservative: a row whose token count doesn't divide
 * evenly is still returned (so nothing is silently dropped) but flagged
 * `ok: false` for the reviewer to fix by hand rather than guessed at.
 */
export function parseResultRows(text: string, subjects: SubjectDef[]): ParseSummary {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  const unparsedLines: { lineNumber: number; text: string }[] = [];
  const expectedTokens = subjects.length * 4;

  lines.forEach((line, idx) => {
    const usnMatch = line.match(USN_PATTERN);
    if (!usnMatch) return;

    const usn = usnMatch[0].toUpperCase();
    const afterUsn = line.slice(usnMatch.index! + usnMatch[0].length);
    const tokens = afterUsn
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && (NUMERIC_OR_MARKER.test(t) || GRADE_TOKEN.test(t)));

    if (tokens.length === 0) {
      unparsedLines.push({ lineNumber: idx + 1, text: line });
      return;
    }

    const ok = tokens.length === expectedTokens;
    const cells: ParsedCell[] = [];
    for (let i = 0; i < subjects.length; i++) {
      const chunk = tokens.slice(i * 4, i * 4 + 4);
      const [cieTok, seeTok, totalTok, gradeTok] = [chunk[0] ?? "", chunk[1] ?? "", chunk[2] ?? "", chunk[3] ?? ""];
      const internalMarks = tokenToNumberOrNull(cieTok);
      const externalMarks = tokenToNumberOrNull(seeTok);
      const totalMarks = tokenToNumberOrNull(totalTok);
      const grade = gradeTok ? gradeTok.toUpperCase() : null;
      cells.push({
        internalMarks,
        externalMarks,
        totalMarks,
        grade,
        status: statusFor(grade, internalMarks !== null && externalMarks !== null && totalMarks !== null),
        raw: chunk.join(" "),
      });
    }

    rows.push({ usn, lineNumber: idx + 1, cells, ok, rawLine: line.trim() });
  });

  return { rows, unparsedLines };
}
