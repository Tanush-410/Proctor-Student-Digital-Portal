import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Award, CheckCircle2, Download, FileText, GraduationCap, XCircle } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, PageSpinner, StatTile } from "../../components/ui";

interface StudentFull {
  usn: string;
  name: string;
  section: string | null;
  admissionYear: number;
  currentSemester: number;
  quota: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  localAddress: string | null;
  localGuardianName: string | null;
  localGuardianPhone: string | null;
  email: string;
  proctor: { facultyId: number; name: string; shortCode: string; email: string; cabinNo: string | null; phone: string | null } | null;
}

interface EffectiveRow {
  subjectCode: string;
  semester: number;
  effective: { subjectName: string | null; grade: string | null; totalMarks: number | null; status: string; sourceType: string };
  discrepancy: boolean;
}

interface Claim {
  claimId: number;
  description: string;
  requestedPoints: number;
  grantedPoints: number | null;
  status: string;
  submittedAt: string;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-700">{value}</div>
    </div>
  );
}

export default function StudentDetail({ base }: { base: string }) {
  const { usn } = useParams<{ usn: string }>();
  const toast = useToast();
  const [student, setStudent] = useState<StudentFull | null>(null);
  const [results, setResults] = useState<{ results: EffectiveRow[]; sgpaBySemester: Record<string, number | null>; cgpa: number | null; backlogSubjects: { subjectCode: string; semester: number }[] } | null>(null);
  const [activity, setActivity] = useState<{ claims: Claim[]; runningTotal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!usn) return;
    setStudent(null);
    setError(null);
    Promise.all([api.get(`/students/${usn}`), api.get(`/students/${usn}/results/effective`), api.get(`/students/${usn}/activity-points`)])
      .then(([s, r, a]) => {
        setStudent(s);
        setResults(r);
        setActivity(a);
      })
      .catch((e) => setError(e.message ?? "Failed to load student"));
  }, [usn]);

  async function downloadReport() {
    if (!usn) return;
    setDownloading(true);
    try {
      const blob = await api.downloadPdf(`/students/${usn}/report`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Report ready", "Opened the Parent Summary Report in a new tab.");
    } catch {
      toast.error("Couldn't generate report", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (error) return <EmptyState message={error} />;
  if (!student) return <PageSpinner />;

  const semesters = [...new Set((results?.results ?? []).map((r) => r.semester))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={student.name} size="lg" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">{student.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <span className="font-mono text-xs text-slate-400">{student.usn}</span>
                <span>·</span>
                <span>Sec {student.section ?? "-"}</span>
                <span>·</span>
                <span>Sem {student.currentSemester}</span>
                <span>·</span>
                <span>Admitted {student.admissionYear}</span>
              </p>
            </div>
          </div>
          <Button onClick={downloadReport} disabled={downloading} icon={downloading ? undefined : Download} className="shrink-0">
            {downloading ? "Preparing..." : "Parent Summary Report"}
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoField label="Father" value={`${student.fatherName ?? "-"} (${student.fatherPhone ?? "-"})`} />
          <InfoField label="Mother" value={`${student.motherName ?? "-"} (${student.motherPhone ?? "-"})`} />
          <InfoField label="Quota" value={student.quota ?? "-"} />
          <InfoField label="Local Address" value={student.localAddress ?? "-"} />
          <InfoField label="Local Guardian" value={`${student.localGuardianName ?? "-"} (${student.localGuardianPhone ?? "-"})`} />
          <InfoField label="Proctor" value={student.proctor ? `${student.proctor.name} (${student.proctor.shortCode})` : "Unassigned"} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="CGPA" value={results?.cgpa ?? "N/A"} tone="blue" icon={GraduationCap} />
        <StatTile label="Backlogs" value={results?.backlogSubjects.length ?? 0} tone={results && results.backlogSubjects.length > 0 ? "red" : "green"} icon={results && results.backlogSubjects.length > 0 ? XCircle : CheckCircle2} />
        <StatTile label="Activity Points" value={activity?.runningTotal ?? 0} tone="amber" icon={Award} />
        <StatTile label="Pending Claims" value={activity?.claims.filter((c) => c.status === "PENDING").length ?? 0} />
      </div>

      <Card>
        <CardHeader title="Academic Record" subtitle="Precedence-resolved effective result per subject; full history is append-only." icon={FileText} />
        {semesters.length === 0 ? (
          <EmptyState message="No result records yet." icon={FileText} />
        ) : (
          <div className="divide-y divide-slate-100">
            {semesters.map((sem) => (
              <div key={sem} className="px-5 py-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Semester {sem}</h3>
                  <Badge tone="blue">SGPA {results?.sgpaBySemester[sem] ?? "N/A"}</Badge>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <tr>
                        <th className="py-1.5 pr-4 font-medium">Subject</th>
                        <th className="py-1.5 pr-4 font-medium">Grade</th>
                        <th className="py-1.5 pr-4 font-medium">Marks</th>
                        <th className="py-1.5 pr-4 font-medium">Status</th>
                        <th className="py-1.5 pr-4 font-medium">Source</th>
                        <th className="py-1.5 pr-4 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {results?.results
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
                            <td className="py-2 pr-4 text-slate-500">{r.effective.sourceType}</td>
                            <td className="py-2 pr-4">{r.discrepancy && <Badge tone="amber">discrepancy</Badge>}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Activity Point Claims" icon={Award} />
        {!activity || activity.claims.length === 0 ? (
          <EmptyState message="No claims submitted yet." icon={Award} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">Description</th>
                <th className="px-5 py-2.5 font-medium">Requested</th>
                <th className="px-5 py-2.5 font-medium">Granted</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {activity.claims.map((c) => (
                <tr key={c.claimId} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-2.5 text-slate-700">{c.description}</td>
                  <td className="px-5 py-2.5 text-slate-600">{c.requestedPoints}</td>
                  <td className="px-5 py-2.5 text-slate-600">{c.grantedPoints ?? "-"}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={c.status === "APPROVED" ? "green" : c.status === "REJECTED" ? "red" : "amber"}>{c.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
