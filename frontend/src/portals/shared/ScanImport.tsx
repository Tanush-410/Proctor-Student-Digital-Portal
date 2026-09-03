import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Plus, ScanLine, Trash2, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Badge, Button, Card, CardHeader, Input, Label, Select } from "../../components/ui";

interface SubjectDef {
  code: string;
  name: string;
  credits: number;
}

interface ParsedCell {
  internalMarks: number | null;
  externalMarks: number | null;
  totalMarks: number | null;
  grade: string | null;
  status: "PASS" | "FAIL" | "WITHHELD" | "ABSENT";
  raw: string;
}

interface ParsedRow {
  usn: string;
  lineNumber: number;
  cells: ParsedCell[];
  ok: boolean;
  rawLine: string;
  studentName: string | null;
  matched: boolean;
}

interface ExtractResponse {
  semester: number;
  subjects: SubjectDef[];
  ocrUsed: boolean;
  rows: ParsedRow[];
  unparsedLines: { lineNumber: number; text: string }[];
  unparsedCount: number;
  rawTextPreview: string;
}

const SOURCE_TYPES = ["MAIN", "TAL", "REVAL", "CHALLENGE_REVAL", "SUPPLEMENTARY"];

function gradeToStatus(grade: string): ParsedCell["status"] {
  const g = grade.toUpperCase();
  if (g === "AB") return "ABSENT";
  if (g === "DX" || g === "I" || g === "NE" || g === "") return "WITHHELD";
  if (g === "F") return "FAIL";
  return "PASS";
}

export default function ScanImport({ base: _base }: { base: string }) {
  const toast = useToast();

  const [semester, setSemester] = useState("4");
  const [sourceType, setSourceType] = useState("MAIN");
  const [subjects, setSubjects] = useState<SubjectDef[]>([{ code: "", name: "", credits: 4 }]);
  const [file, setFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [committing, setCommitting] = useState(false);
  const [summary, setSummary] = useState<{ batchId: number; created: number; exceptions: number } | null>(null);

  function updateSubject(i: number, patch: Partial<SubjectDef>) {
    setSubjects((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addSubject() {
    setSubjects((prev) => [...prev, { code: "", name: "", credits: 4 }]);
  }
  function removeSubject(i: number) {
    setSubjects((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateCell(rowIdx: number, cellIdx: number, patch: Partial<ParsedCell>) {
    setResult((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, ri) => {
        if (ri !== rowIdx) return r;
        const cells = r.cells.map((c, ci) => (ci === cellIdx ? { ...c, ...patch } : c));
        return { ...r, cells };
      });
      return { ...prev, rows };
    });
  }

  async function handleExtract() {
    if (!file) return;
    if (subjects.some((s) => !s.code.trim())) {
      toast.error("Add a subject code", "Every subject needs a code before extracting.");
      return;
    }
    setExtracting(true);
    setResult(null);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("semester", semester);
      form.append("subjects", JSON.stringify(subjects.map((s) => ({ code: s.code.trim(), name: s.name.trim() || undefined, credits: s.credits }))));
      const res = await api.upload("/admin/scan/extract", form);
      setResult(res);
      if (res.rows.length === 0) {
        toast.error("Nothing recognisable found", "No USN-shaped rows were found in this file — check the scan quality or try the other file type.");
      } else {
        toast.success(`Read ${res.rows.length} row(s)`, res.ocrUsed ? "Extracted via OCR — double-check the numbers below." : "Extracted from the PDF's text layer.");
      }
    } catch (err) {
      toast.error("Extraction failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleCommit() {
    if (!result) return;
    setCommitting(true);
    try {
      const res = await api.post("/admin/scan/commit", {
        semester: result.semester,
        sourceType,
        subjects: result.subjects,
        rows: result.rows.map((r) => ({ usn: r.usn, cells: r.cells })),
      });
      setSummary(res);
      toast.success("Imported", `${res.created} result record(s) created${res.exceptions ? `, ${res.exceptions} routed to exceptions` : ""}.`);
    } catch (err) {
      toast.error("Import failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setCommitting(false);
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setSummary(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Scan Import</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload a result sheet — a PDF with real text, or a photo/scan as a JPEG or PNG — and have it read automatically.
          Nothing is written to the database until you review and confirm below.
        </p>
      </div>

      {!result && (
        <>
          <Card>
            <CardHeader title="1. Sheet Details" icon={ScanLine} />
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <Label>Semester</Label>
                  <Input type="number" min={1} max={8} value={semester} onChange={(e) => setSemester(e.target.value)} />
                </div>
                <div>
                  <Label>Source Type</Label>
                  <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                    {SOURCE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <Label>Subjects, in the order they appear on the sheet</Label>
                <div className="space-y-2">
                  {subjects.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input placeholder="Code, e.g. 23CS4PCOPS" value={s.code} onChange={(e) => updateSubject(i, { code: e.target.value })} className="flex-1" />
                      <Input placeholder="Name (optional)" value={s.name} onChange={(e) => updateSubject(i, { name: e.target.value })} className="flex-[2]" />
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        value={s.credits}
                        onChange={(e) => updateSubject(i, { credits: parseInt(e.target.value, 10) || 0 })}
                        className="w-20"
                      />
                      <button type="button" onClick={() => removeSubject(i)} disabled={subjects.length === 1} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={addSubject} className="mt-2">
                  Add subject
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="2. Upload the Sheet" subtitle="PDF (with a real text layer) or an image (JPEG/PNG/WEBP) — images are OCR'd automatically." />
            <div className="space-y-4 px-5 py-4">
              <FileDropzone file={file} onChange={setFile} accept=".pdf,image/jpeg,image/png,image/webp" hint="PDF, JPEG, PNG, or WEBP" />
              <Button onClick={handleExtract} disabled={!file || extracting} icon={ScanLine}>
                {extracting ? "Reading..." : "Extract"}
              </Button>
            </div>
          </Card>
        </>
      )}

      {result && !summary && (
        <Card>
          <CardHeader
            title={`3. Review — ${result.rows.length} row(s) found`}
            subtitle={result.ocrUsed ? "Read via OCR — check every cell before importing." : "Read from the PDF's text layer."}
            action={
              <Button variant="secondary" size="sm" onClick={reset}>
                Start over
              </Button>
            }
          />
          {result.unparsedCount > 0 && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {result.unparsedCount} line(s) had a USN but no readable marks and were skipped — check the source file for those students.
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  {result.subjects.map((s) => (
                    <th key={s.code} className="px-4 py-2.5 font-medium">
                      {s.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, ri) => (
                  <tr key={row.usn} className={`border-t border-slate-100 ${!row.matched || !row.ok ? "bg-amber-50/40" : ""}`}>
                    <td className="px-4 py-2 align-top">
                      <div className="font-mono text-xs text-slate-500">{row.usn}</div>
                      {row.matched ? (
                        <div className="text-xs text-slate-700">{row.studentName}</div>
                      ) : (
                        <Badge tone="red" icon={XCircle}>
                          unknown USN
                        </Badge>
                      )}
                      {!row.ok && (
                        <Badge tone="amber" icon={AlertTriangle}>
                          check columns
                        </Badge>
                      )}
                    </td>
                    {row.cells.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2 align-top">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={cell.totalMarks ?? ""}
                            onChange={(e) => {
                              const v = e.target.value === "" ? null : parseInt(e.target.value, 10);
                              updateCell(ri, ci, { totalMarks: v });
                            }}
                            className="w-16 py-1 text-xs"
                          />
                          <Input
                            value={cell.grade ?? ""}
                            onChange={(e) => {
                              const g = e.target.value.toUpperCase();
                              updateCell(ri, ci, { grade: g || null, status: gradeToStatus(g) });
                            }}
                            className="w-14 py-1 text-xs"
                          />
                        </div>
                        <div className="mt-1">
                          <Badge tone={cell.status === "PASS" ? "green" : cell.status === "FAIL" ? "red" : "amber"}>{cell.status}</Badge>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
            <Button onClick={handleCommit} disabled={committing} icon={CheckCircle2}>
              {committing ? "Importing..." : `Confirm & Import ${result.rows.length} Row(s)`}
            </Button>
            <span className="text-xs text-slate-400">Every subject cell becomes its own append-only result record — nothing overwrites an existing one.</span>
          </div>
        </Card>
      )}

      {summary && (
        <Card>
          <CardHeader title="Import Complete" icon={CheckCircle2} />
          <div className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone="green">{summary.created} records created</Badge>
              <Badge tone={summary.exceptions > 0 ? "amber" : "green"}>{summary.exceptions} exceptions</Badge>
            </div>
            {summary.exceptions > 0 && (
              <p className="text-sm text-slate-500">
                Some rows referenced students outside your proctee list, or an unknown USN. See the{" "}
                <Link to={_base === "/admin" ? "/admin/exceptions" : "/proctor"} className="text-brand-600 hover:underline">
                  Exceptions
                </Link>{" "}
                for details.
              </p>
            )}
            <Button variant="secondary" onClick={reset}>
              Scan another sheet
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
