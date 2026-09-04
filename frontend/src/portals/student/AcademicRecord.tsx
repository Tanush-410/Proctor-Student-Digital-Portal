import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, FilePlus2, GraduationCap, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, PageSpinner, ResponsiveTable, StatTile } from "../../components/ui";

interface EffectiveRow {
  subjectCode: string;
  semester: number;
  effective: { subjectName: string | null; grade: string | null; totalMarks: number | null; status: string; sourceType: string };
  discrepancy: boolean;
}

export default function AcademicRecord() {
  const { auth } = useAuth();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [results, setResults] = useState<{ results: EffectiveRow[]; sgpaBySemester: Record<string, number | null>; cgpa: number | null } | null>(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    if (usn) api.get(`/students/${usn}/results/effective`).then(setResults);
  }

  useEffect(load, [usn]);

  const semesters = [...new Set((results?.results ?? []).map((r) => r.semester))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">My Academic Record</h1>
          <p className="mt-1 text-sm text-slate-500">Effective results, computed by precedence over every uploaded/self-entered record.</p>
        </div>
        <Button variant="secondary" icon={FilePlus2} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "Self-Enter Result"}
        </Button>
      </div>

      {results === null ? (
        <PageSpinner />
      ) : (
        <>
          <StatTile label="CGPA" value={results.cgpa ?? "N/A"} tone="blue" icon={GraduationCap} />

          {showForm && (
            <SelfEntryForm
              usn={usn}
              onDone={() => {
                setShowForm(false);
                load();
              }}
            />
          )}

          <Card>
            <CardHeader title="Semester-wise Results" />
            {semesters.length === 0 ? (
              <EmptyState message="No results recorded yet." icon={GraduationCap} />
            ) : (
              <div className="divide-y divide-slate-100">
                {semesters.map((sem) => (
                  <div key={sem} className="px-5 py-4">
                    <div className="mb-2.5 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-700">Semester {sem}</h3>
                      <Badge tone="blue">SGPA {results.sgpaBySemester[sem] ?? "N/A"}</Badge>
                    </div>
                    <ResponsiveTable
                      table={
                        <table className="w-full text-sm">
                          <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                            <tr>
                              <th className="py-1.5 pr-4 font-medium">Subject</th>
                              <th className="py-1.5 pr-4 font-medium">Grade</th>
                              <th className="py-1.5 pr-4 font-medium">Marks</th>
                              <th className="py-1.5 pr-4 font-medium">Status</th>
                              <th className="py-1.5 pr-4 font-medium" />
                            </tr>
                          </thead>
                          <tbody>
                            {results.results
                              .filter((r) => r.semester === sem)
                              .map((r) => (
                                <tr key={r.subjectCode} className="border-t border-slate-50 transition-colors hover:bg-slate-50/70">
                                  <td className="py-2 pr-4 text-slate-700">
                                    {r.subjectCode}
                                    {r.effective.subjectName ? <span className="text-slate-400"> — {r.effective.subjectName}</span> : ""}
                                  </td>
                                  <td className="py-2 pr-4 font-semibold text-slate-800">{r.effective.grade ?? "-"}</td>
                                  <td className="py-2 pr-4 text-slate-600">{r.effective.totalMarks ?? "-"}</td>
                                  <td className="py-2 pr-4">
                                    <Badge tone={r.effective.status === "PASS" ? "green" : "red"} icon={r.effective.status === "PASS" ? CheckCircle2 : XCircle}>
                                      {r.effective.status}
                                    </Badge>
                                  </td>
                                  <td className="py-2 pr-4">{r.discrepancy && <Badge tone="amber">recheck: differs from your entry</Badge>}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      }
                      cards={results.results
                        .filter((r) => r.semester === sem)
                        .map((r) => (
                          <li key={r.subjectCode} className="py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm text-slate-700">
                                  {r.subjectCode}
                                  {r.effective.subjectName && <div className="text-xs text-slate-400">{r.effective.subjectName}</div>}
                                </div>
                              </div>
                              <span className="shrink-0 text-sm font-semibold text-slate-800">{r.effective.grade ?? "-"}</span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge tone={r.effective.status === "PASS" ? "green" : "red"} icon={r.effective.status === "PASS" ? CheckCircle2 : XCircle}>
                                {r.effective.status}
                              </Badge>
                              <span className="text-xs text-slate-400">{r.effective.totalMarks ?? "-"} marks</span>
                              {r.discrepancy && <Badge tone="amber">recheck: differs from your entry</Badge>}
                            </div>
                          </li>
                        ))}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SelfEntryForm({ usn, onDone }: { usn: string; onDone: () => void }) {
  const toast = useToast();
  const [subjectCode, setSubjectCode] = useState("");
  const [semester, setSemester] = useState("");
  const [totalMarks, setTotalMarks] = useState("");
  const [grade, setGrade] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/students/${usn}/results/self-entry`, {
        subjectCode,
        semester: parseInt(semester, 10),
        totalMarks: totalMarks ? parseInt(totalMarks, 10) : undefined,
        grade: grade || undefined,
      });
      toast.success("Provisional result submitted", "It'll show as pending until the official result is uploaded.");
      onDone();
    } catch (err) {
      toast.error("Couldn't submit", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="animate-in-fast">
      <CardHeader title="Self-Entry" subtitle="A provisional placeholder — it never overrides an official result, and any mismatch is flagged for you to recheck." icon={FilePlus2} />
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
        <div>
          <Label>Subject Code</Label>
          <Input required value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} />
        </div>
        <div>
          <Label>Semester</Label>
          <Input required type="number" min={1} max={8} value={semester} onChange={(e) => setSemester(e.target.value)} />
        </div>
        <div>
          <Label>Total Marks</Label>
          <Input type="number" value={totalMarks} onChange={(e) => setTotalMarks(e.target.value)} />
        </div>
        <div>
          <Label>Grade</Label>
          <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. A" />
        </div>
        <div className="col-span-2 sm:col-span-4">
          <Button type="submit" disabled={busy}>
            {busy ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
