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
}

/** ReportGenerationService.buildParentSummary — streams a PDF built from the effective-results view. */
export function buildParentSummaryPdf(data: ParentSummaryData, res: Response) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${data.student.usn}-parent-summary.pdf"`);
  doc.pipe(res);

  doc.fontSize(18).text("Parent Summary Report", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("gray").text("Online Proctor Diary & Student Academic Management System", { align: "center" });
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
  doc.fontSize(11).text(`CGPA: ${data.cgpa ?? "N/A"}`);
  doc.text(`Backlog Subjects: ${data.backlogSubjects.length === 0 ? "None" : data.backlogSubjects.map((b) => `${b.subjectCode} (Sem ${b.semester})`).join(", ")}`);
  doc.moveDown(1);

  doc.fontSize(13).text("Activity Points");
  doc.fontSize(10).text(`Total Approved Points: ${data.activityPointsTotal}`);

  doc.moveDown(2);
  doc.fontSize(8).fillColor("gray").text(`Generated ${new Date().toLocaleString()}`, { align: "right" });

  doc.end();
}
