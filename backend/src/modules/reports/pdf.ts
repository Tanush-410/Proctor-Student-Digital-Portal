import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import { Response } from "express";
import { Student, Faculty } from "@prisma/client";
import { EffectiveResult } from "../results/engine";

export interface ParentSummaryData {
  student: Student & { proctor: Faculty | null };
  effective: EffectiveResult[];
  sgpaBySemester: Record<number, number | null>;
  cgpa: number | null;
  backlogSubjects: { subjectCode: string; semester: number }[];
  activityPointsTotal: number;
  recentNotes?: { note: string; author: string; createdAt: Date }[];
  rank?: { position: number; of: number } | null;
  comparison?: {
    section: { label: string; avgCgpa: number | null } | null;
    semester: { label: string; avgCgpa: number | null };
  } | null;
}

const LOGO_PATH = path.join(__dirname, "../../assets/bms-logo.png");

/** AICTE activity-point requirement for the full UG programme (design doc, Section 8). */
const REQUIRED_ACTIVITY_POINTS = 100;

/** Grades in scale order, with the colour used for them in charts. */
const GRADE_ORDER: { g: string; c: string }[] = [
  { g: "O", c: "#15803d" },
  { g: "A+", c: "#16a34a" },
  { g: "A", c: "#65a30d" },
  { g: "B+", c: "#ca8a04" },
  { g: "B", c: "#d97706" },
  { g: "C", c: "#ea580c" },
  { g: "P", c: "#dc2626" },
  { g: "F", c: "#991b1b" },
];

type Doc = PDFKit.PDFDocument;

/** ReportGenerationService.buildParentSummary — streams a PDF built from the effective-results view. */
export function buildParentSummaryPdf(data: ParentSummaryData, res: Response) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${data.student.usn}-parent-summary.pdf"`);
  doc.pipe(res);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, doc.page.width / 2 - 22, doc.y, { width: 44, height: 44 });
    doc.moveDown(3.2);
  }
  doc.fontSize(18).text("Parent Summary Report", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("gray").text("BMS College of Engineering — Online Proctor Diary & Student Academic Management System", { align: "center" });
  doc.fillColor("black");
  doc.moveDown(1.5);

  doc.fontSize(13).text("Student Details");
  doc.moveDown(0.3);
  doc.fontSize(10);
  const s = data.student;
  doc.text(`Name: ${s.name}        USN: ${s.usn}`);
  doc.text(`Section: ${s.section ?? "-"}    Current Semester: ${s.currentSemester}    Admission Year: ${s.admissionYear}`);
  doc.text(`Father: ${s.fatherName ?? "-"} (${s.fatherPhone ?? "-"})`);
  doc.text(`Mother: ${s.motherName ?? "-"} (${s.motherPhone ?? "-"})`);
  doc.text(`Local Guardian: ${s.localGuardianName ?? "-"} (${s.localGuardianPhone ?? "-"})`);
  doc.text(`Proctor: ${s.proctor?.name ?? "-"} (${s.proctor?.shortCode ?? "-"}), Cabin ${s.proctor?.cabinNo ?? "-"}, ${s.proctor?.phone ?? s.proctor?.email ?? "-"}`);
  doc.moveDown(1);

  doc.fontSize(13).text("Academic Performance (Effective Results)");
  doc.moveDown(0.3);

  const semesters = [...new Set(data.effective.map((r) => r.semester))].sort((a, b) => a - b);

  if (semesters.length === 0) {
    doc.fontSize(10).fillColor("gray")
      .text("No results recorded yet — the performance charts below will populate once semester results are uploaded.")
      .fillColor("black");
  }

  for (const sem of semesters) {
    doc.fontSize(11).text(`Semester ${sem} — SGPA: ${data.sgpaBySemester[sem] ?? "N/A"}`, { underline: true });
    doc.fontSize(9);
    const rows = data.effective.filter((r) => r.semester === sem);
    for (const r of rows) {
      const e = r.effective;
      const flag = r.discrepancy ? "  [discrepancy: student entry differs]" : "";
      doc.text(`  ${e.subjectCode}${e.subjectName ? " - " + e.subjectName : ""}: ${e.grade ?? "-"} (${e.totalMarks ?? "-"} marks, ${e.status}, source ${e.sourceType})${flag}`);
    }
    doc.moveDown(0.4);
  }

  doc.moveDown(0.5);
  const rankText = data.rank ? `  (Rank ${data.rank.position} of ${data.rank.of} among proctor's students)` : "";
  doc.fontSize(11).text(`CGPA: ${data.cgpa ?? "N/A"}${rankText}`);
  doc.text(`Backlog Subjects: ${data.backlogSubjects.length === 0 ? "None" : data.backlogSubjects.map((b) => `${b.subjectCode} (Sem ${b.semester})`).join(", ")}`);
  doc.moveDown(1);

  doc.fontSize(13).text("Activity Points");
  doc.fontSize(10).text(`Total Approved Points: ${data.activityPointsTotal} / ${REQUIRED_ACTIVITY_POINTS} required`);
  doc.moveDown(1);

  if (data.recentNotes && data.recentNotes.length > 0) {
    doc.fontSize(13).fillColor("black").text("Proctor's Remarks");
    doc.moveDown(0.3);
    doc.fontSize(9);
    for (const n of data.recentNotes) {
      doc.fillColor("#334155").text(`"${n.note}"`, { indent: 10 });
      doc.fontSize(8).fillColor("#94a3b8").text(`— ${n.author}, ${new Date(n.createdAt).toLocaleDateString()}`, { indent: 10 });
      doc.fontSize(9).moveDown(0.3);
    }
    doc.fillColor("black");
  }

  // ---- Charts ----
  drawChartsPage(doc, data, semesters);

  doc.moveDown(2);
  doc.fontSize(8).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`, { align: "right" });

  doc.end();
}

function drawChartsPage(doc: Doc, data: ParentSummaryData, semesters: number[]) {
  doc.addPage();
  doc.fontSize(15).fillColor("black").text("Performance Charts", { align: "center" });
  doc.moveDown(1);

  const left = doc.page.margins.left;
  const usableW = doc.page.width - left - doc.page.margins.right;
  const colW = (usableW - 24) / 2;
  const rowH = 190;
  const top = doc.y;

  // 1. SGPA trend (top-left)
  const sgpaPoints = semesters
    .map((sem) => ({ label: `S${sem}`, value: data.sgpaBySemester[sem] }))
    .filter((p): p is { label: string; value: number } => typeof p.value === "number");
  drawPanel(doc, left, top, colW, rowH, "SGPA Trend", (x, y, w, h) => {
    if (sgpaPoints.length === 0) return emptyNote(doc, x, y, w, h);
    lineChart(doc, x, y, w, h, sgpaPoints, 10, data.cgpa ?? undefined, "CGPA");
  });

  // 2. Grade distribution (top-right)
  const gradeCounts = countGrades(data.effective);
  drawPanel(doc, left + colW + 24, top, colW, rowH, "Grade Distribution", (x, y, w, h) => {
    if (data.effective.length === 0) return emptyNote(doc, x, y, w, h);
    barChart(
      doc, x, y, w, h,
      GRADE_ORDER.map((go) => ({ label: go.g, value: gradeCounts[go.g] ?? 0, color: go.c })),
      Math.max(1, ...Object.values(gradeCounts))
    );
  });

  // 3. Latest-semester subject marks (bottom-left)
  const latestSem = semesters.length ? semesters[semesters.length - 1] : null;
  const subjMarks = latestSem == null ? [] : data.effective
    .filter((r) => r.semester === latestSem)
    .map((r) => ({ label: shortCode(r.subjectCode), value: r.effective.totalMarks ?? 0 }));
  drawPanel(doc, left, top + rowH + 30, colW, rowH,
    latestSem == null ? "Subject Marks (latest semester)" : `Subject Marks — Semester ${latestSem}`,
    (x, y, w, h) => {
      if (subjMarks.length === 0) return emptyNote(doc, x, y, w, h);
      barChart(doc, x, y, w, h, subjMarks.map((m) => ({ ...m, color: m.value >= 40 ? "#2563eb" : "#dc2626" })), 100, 40, "pass");
    });

  // 4. Activity points progress (bottom-right)
  drawPanel(doc, left + colW + 24, top + rowH + 30, colW, rowH, "Activity Points", (x, y, w, h) => {
    progressBar(doc, x, y + h / 2 - 24, w, data.activityPointsTotal, REQUIRED_ACTIVITY_POINTS);
  });

  // 5. Cohort comparison (full-width, third row) — this student's CGPA next
  // to their section and semester-wide averages, so the report answers "how
  // does this compare" without the parent having to do that math themselves.
  if (data.comparison && data.cgpa !== null) {
    const row3Y = top + rowH * 2 + 60;
    const row3H = 150;
    drawPanel(doc, left, row3Y, usableW, row3H, "Cohort Comparison — CGPA", (x, y, w, h) => {
      const bars: { label: string; value: number; color?: string }[] = [{ label: "You", value: data.cgpa as number, color: "#2563eb" }];
      if (data.comparison!.section && data.comparison!.section.avgCgpa !== null) {
        bars.push({ label: data.comparison!.section.label, value: data.comparison!.section.avgCgpa, color: "#94a3b8" });
      }
      if (data.comparison!.semester.avgCgpa !== null) {
        bars.push({ label: data.comparison!.semester.label, value: data.comparison!.semester.avgCgpa, color: "#cbd5e1" });
      }
      barChart(doc, x, y, w, h, bars, 10);
    });
  }
}

// ---------- chart primitives (PDFKit vector drawing) ----------

function drawPanel(doc: Doc, x: number, y: number, w: number, h: number, title: string, body: (x: number, y: number, w: number, h: number) => void) {
  doc.save();
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.5).strokeColor("#cbd5e1").stroke();
  doc.fontSize(9).fillColor("#334155").text(title, x + 10, y + 8, { width: w - 20 });
  doc.restore();
  const pad = 12;
  body(x + pad + 14, y + 24 + pad, w - pad * 2 - 14, h - 24 - pad * 2 - 12);
}

function emptyNote(doc: Doc, x: number, y: number, w: number, h: number) {
  doc.save().fontSize(8).fillColor("#94a3b8")
    .text("No data yet", x, y + h / 2 - 6, { width: w, align: "center" })
    .restore();
}

/** Vertical bar chart. `data` = [{label, value, color?}], y-axis 0..max. Optional reference line. */
function barChart(
  doc: Doc, x: number, y: number, w: number, h: number,
  bars: { label: string; value: number; color?: string }[],
  max: number, refValue?: number, refLabel?: string
) {
  doc.save();
  const baseY = y + h;
  // axes
  doc.lineWidth(0.5).strokeColor("#94a3b8").moveTo(x, y).lineTo(x, baseY).lineTo(x + w, baseY).stroke();
  // y ticks (0, mid, max)
  doc.fontSize(6).fillColor("#64748b");
  [0, max / 2, max].forEach((v) => {
    const ty = baseY - (v / max) * h;
    doc.text(String(Math.round(v)), x - 14, ty - 3, { width: 12, align: "right" });
    doc.strokeColor("#e2e8f0").moveTo(x, ty).lineTo(x + w, ty).stroke();
  });
  const n = bars.length;
  const slot = w / n;
  const bw = Math.min(slot * 0.6, 34);
  bars.forEach((b, i) => {
    const bx = x + i * slot + (slot - bw) / 2;
    const bh = Math.max(0, (Math.min(b.value, max) / max) * h);
    doc.rect(bx, baseY - bh, bw, bh).fillColor(b.color ?? "#2563eb").fill();
    doc.fontSize(6).fillColor("#334155").text(String(b.value), bx - 4, baseY - bh - 9, { width: bw + 8, align: "center" });
    doc.fontSize(6).fillColor("#64748b").text(b.label, bx - slot * 0.2, baseY + 3, { width: bw + slot * 0.4, align: "center" });
  });
  if (typeof refValue === "number") {
    const ry = baseY - (Math.min(refValue, max) / max) * h;
    doc.save().dash(2, { space: 2 }).lineWidth(0.8).strokeColor("#dc2626")
      .moveTo(x, ry).lineTo(x + w, ry).stroke().undash().restore();
    if (refLabel) doc.fontSize(6).fillColor("#dc2626").text(`- - ${refLabel} ${refValue}`, x + 2, y - 9, { width: w, align: "right" });
  }
  doc.restore();
}

/** Line chart for a small ordered series, y-axis 0..max. Optional horizontal reference line. */
function lineChart(
  doc: Doc, x: number, y: number, w: number, h: number,
  points: { label: string; value: number }[],
  max: number, refValue?: number, refLabel?: string
) {
  doc.save();
  const baseY = y + h;
  doc.lineWidth(0.5).strokeColor("#94a3b8").moveTo(x, y).lineTo(x, baseY).lineTo(x + w, baseY).stroke();
  doc.fontSize(6).fillColor("#64748b");
  [0, max / 2, max].forEach((v) => {
    const ty = baseY - (v / max) * h;
    doc.text(String(Math.round(v)), x - 14, ty - 3, { width: 12, align: "right" });
    doc.strokeColor("#e2e8f0").moveTo(x, ty).lineTo(x + w, ty).stroke();
  });
  const n = points.length;
  const step = n > 1 ? w / (n - 1) : 0;
  const xy = points.map((p, i) => ({
    px: n === 1 ? x + w / 2 : x + i * step,
    py: baseY - (Math.min(p.value, max) / max) * h,
    p,
  }));
  if (typeof refValue === "number") {
    const ry = baseY - (Math.min(refValue, max) / max) * h;
    doc.save().dash(2, { space: 2 }).lineWidth(0.8).strokeColor("#9333ea")
      .moveTo(x, ry).lineTo(x + w, ry).stroke().undash().restore();
    if (refLabel) doc.fontSize(6).fillColor("#9333ea").text(`- - ${refLabel} ${refValue}`, x + 2, y - 9, { width: w, align: "right" });
  }
  doc.lineWidth(1.4).strokeColor("#2563eb");
  xy.forEach((pt, i) => (i === 0 ? doc.moveTo(pt.px, pt.py) : doc.lineTo(pt.px, pt.py)));
  if (xy.length > 1) doc.stroke(); else doc.strokeColor("#2563eb");
  xy.forEach((pt) => {
    doc.circle(pt.px, pt.py, 2.2).fillColor("#2563eb").fill();
    doc.fontSize(6).fillColor("#334155").text(pt.p.value.toFixed(2), pt.px - 14, pt.py - 12, { width: 28, align: "center" });
    doc.fontSize(6).fillColor("#64748b").text(pt.p.label, pt.px - 14, baseY + 3, { width: 28, align: "center" });
  });
  doc.restore();
}

/** Horizontal progress bar: value / max, with a threshold marker at max. */
function progressBar(doc: Doc, x: number, y: number, w: number, value: number, max: number) {
  doc.save();
  const barH = 16;
  const frac = Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
  doc.roundedRect(x, y, w, barH, 3).fillColor("#e2e8f0").fill();
  doc.roundedRect(x, y, Math.max(2, w * frac), barH, 3).fillColor(value >= max ? "#16a34a" : "#2563eb").fill();
  doc.fontSize(9).fillColor("#0f172a").text(`${value} / ${max} points`, x, y + barH + 8, { width: w, align: "center" });
  const pct = Math.round(frac * 100);
  doc.fontSize(7).fillColor("#64748b").text(
    value >= max ? "Requirement met" : `${pct}% of requirement — ${max - value} points remaining`,
    x, y + barH + 22, { width: w, align: "center" }
  );
  doc.restore();
}

// ---------- helpers ----------

function countGrades(effective: EffectiveResult[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of effective) {
    const g = (r.effective.grade ?? "").toUpperCase();
    if (!g) continue;
    out[g] = (out[g] ?? 0) + 1;
  }
  return out;
}

/** "23CS4PCOPS" -> "PCOPS" so bar labels stay readable. */
function shortCode(code: string): string {
  const m = code.match(/^\d{2}[A-Z]{2}\d([A-Z]{2,6})$/);
  return m ? m[1] : code.slice(-5);
}
