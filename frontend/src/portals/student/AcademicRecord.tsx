import { FormEvent, useEffect, useState } from "react";
import { FilePlus2, GraduationCap } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, Card, CardHeader, EmptyState, Input, Label, PageSpinner, SemesterTabs, StatTile } from "../../components/ui";
import { ResultTable, ResultTableRow } from "../shared/ResultTable";

type EffectiveRow = ResultTableRow & { semester: number };

export default function AcademicRecord() {
  const { auth } = useAuth();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [results, setResults] = useState<{ results: EffectiveRow[]; sgpaBySemester: Record<string, number | null>; cgpa: number | null } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeSem, setActiveSem] = useState<number | null>(null);

  function load() {
    if (!usn) return;
    api.get(`/students/${usn}/results/effective`).then((data: { results: EffectiveRow[]; sgpaBySemester: Record<string, number | null>; cgpa: number | null }) => {
      setResults(data);
      const sems = [...new Set(data.results.map((r) => r.semester))].sort((a, b) => a - b);
      setActiveSem((prev) => (prev !== null && sems.includes(prev) ? prev : sems[sems.length - 1] ?? null));
    });
  }

  useEffect(load, [usn]);

  const semesters = [...new Set((results?.results ?? []).map((r) => r.semester))].sort((a, b) => a - b);
  const semResults = (results?.results ?? []).filter((r) => r.semester === activeSem);

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
          <StatTile
            label="CGPA"
            value={results.cgpa ?? "N/A"}
            tone="blue"
            icon={GraduationCap}
            trend={Object.entries(results.sgpaBySemester)
              .sort((a, b) => Number(a[0]) - Number(b[0]))
              .map(([, v]) => v)
              .filter((v): v is number => v !== null)}
          />

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
              <div className="px-5 py-4">
                <SemesterTabs semesters={semesters} active={activeSem ?? semesters[semesters.length - 1]} onChange={setActiveSem} />
                <div className="mt-4">
                  <ResultTable sgpa={activeSem !== null ? results.sgpaBySemester[activeSem] ?? null : null} rows={semResults} />
                </div>
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
