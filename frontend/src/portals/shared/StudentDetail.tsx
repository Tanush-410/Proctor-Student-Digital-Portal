import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, CalendarCheck, CalendarPlus, CheckCircle2, Clock, Download, FileText, GraduationCap, MessageSquarePlus, Paperclip, Sparkles, StickyNote, Trash2, Users, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Breadcrumb, Button, Card, CardHeader, EmptyState, PageSpinner, ResponsiveTable, Select, StatTile, Textarea } from "../../components/ui";
import { BarChart } from "../../components/charts";

interface StudentFull {
  usn: string;
  name: string;
  section: string | null;
  admissionYear: number;
  currentSemester: number;
  proctorId: number | null;
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

interface Note {
  id: number;
  usn: string;
  authorId: number;
  note: string;
  createdAt: string;
  author: { name: string; shortCode: string };
}

interface Comparison {
  cgpa: number | null;
  section: { label: string; avgCgpa: number | null; percentile: number | null; rank: number | null; of: number } | null;
  semester: { label: string; avgCgpa: number | null; percentile: number | null; rank: number | null; of: number };
}

interface ProctorOption {
  facultyId: number;
  name: string;
  shortCode: string;
  role: string;
}

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  percentage: number | null;
  recent: { id: number; date: string; status: string }[];
}

interface AccoladeItem {
  id: number;
  title: string;
  description: string;
  category: string | null;
  proofFile: string | null;
  createdAt: string;
}

const ACCOLADE_CATEGORY_TONE: Record<string, "blue" | "green" | "amber" | "red" | "slate"> = {
  Sports: "green",
  Technical: "blue",
  Cultural: "amber",
  Academic: "blue",
  Volunteering: "slate",
  Other: "slate",
};

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
  const { auth } = useAuth();
  const toast = useToast();
  const [student, setStudent] = useState<StudentFull | null>(null);
  const [results, setResults] = useState<{ results: EffectiveRow[]; sgpaBySemester: Record<string, number | null>; cgpa: number | null; backlogSubjects: { subjectCode: string; semester: number }[] } | null>(null);
  const [activity, setActivity] = useState<{ claims: Claim[]; runningTotal: number } | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [proctorOptions, setProctorOptions] = useState<ProctorOption[]>([]);
  const [reassigning, setReassigning] = useState(false);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [accolades, setAccolades] = useState<AccoladeItem[] | null>(null);

  function loadNotes() {
    if (!usn) return;
    api.get(`/students/${usn}/notes`).then(setNotes);
  }

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
    loadNotes();
    api.get(`/students/${usn}/analytics/comparison`).then(setComparison);
    api.get(`/students/${usn}/attendance/summary`).then(setAttendance);
    api.get(`/students/${usn}/accolades`).then(setAccolades);
  }, [usn]);

  useEffect(() => {
    if (auth?.role === "ADMIN") {
      api.get("/proctors").then((r) => setProctorOptions(r.filter((f: ProctorOption) => f.role === "PROCTOR")));
    }
  }, [auth]);

  async function handleReassign(e: React.ChangeEvent<HTMLSelectElement>) {
    if (!usn) return;
    const proctorId = e.target.value === "" ? null : parseInt(e.target.value, 10);
    setReassigning(true);
    try {
      await api.patch(`/students/${usn}/proctor`, { proctorId });
      const refreshed = await api.get(`/students/${usn}`);
      setStudent(refreshed);
      toast.success("Proctor updated");
    } catch (err) {
      toast.error("Couldn't reassign", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setReassigning(false);
    }
  }

  async function submitNote(e: FormEvent) {
    e.preventDefault();
    if (!usn || !noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/students/${usn}/notes`, { note: noteText.trim() });
      setNoteText("");
      loadNotes();
      toast.success("Note added");
    } catch (err) {
      toast.error("Couldn't add note", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setAddingNote(false);
    }
  }

  async function deleteNote(id: number) {
    if (!usn) return;
    try {
      await api.delete(`/students/${usn}/notes/${id}`);
      loadNotes();
    } catch (err) {
      toast.error("Couldn't remove note", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

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
      <Breadcrumb items={[{ label: "Directory", to: `${base}/directory` }, { label: student.name }]} />
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
          <div className="flex shrink-0 flex-wrap gap-2">
            {base === "/proctor" && (
              <Link to={`${base}/calendar?usn=${student.usn}`}>
                <Button variant="secondary" icon={CalendarPlus}>
                  Record PTM
                </Button>
              </Link>
            )}
            <Button onClick={downloadReport} disabled={downloading} icon={downloading ? undefined : Download}>
              {downloading ? "Preparing..." : "Parent Summary Report"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoField label="Father" value={`${student.fatherName ?? "-"} (${student.fatherPhone ?? "-"})`} />
          <InfoField label="Mother" value={`${student.motherName ?? "-"} (${student.motherPhone ?? "-"})`} />
          <InfoField label="Quota" value={student.quota ?? "-"} />
          <InfoField label="Local Address" value={student.localAddress ?? "-"} />
          <InfoField label="Local Guardian" value={`${student.localGuardianName ?? "-"} (${student.localGuardianPhone ?? "-"})`} />
          {auth?.role === "ADMIN" ? (
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Proctor</div>
              <Select value={student.proctorId ?? ""} onChange={handleReassign} disabled={reassigning} className="mt-0.5 py-1.5 text-sm">
                <option value="">Unassigned</option>
                {proctorOptions.map((p) => (
                  <option key={p.facultyId} value={p.facultyId}>
                    {p.name} ({p.shortCode})
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <InfoField label="Proctor" value={student.proctor ? `${student.proctor.name} (${student.proctor.shortCode})` : "Unassigned"} />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatTile label="CGPA" value={results?.cgpa ?? "N/A"} tone="blue" icon={GraduationCap} />
        <StatTile label="Backlogs" value={results?.backlogSubjects.length ?? 0} tone={results && results.backlogSubjects.length > 0 ? "red" : "green"} icon={results && results.backlogSubjects.length > 0 ? XCircle : CheckCircle2} />
        <StatTile label="Activity Points" value={activity?.runningTotal ?? 0} tone="amber" icon={Award} />
        <StatTile label="Pending Claims" value={activity?.claims.filter((c) => c.status === "PENDING").length ?? 0} />
        <StatTile
          label="Attendance"
          value={attendance?.percentage ?? "N/A"}
          tone={attendance?.percentage !== null && attendance !== null && attendance.percentage! < 75 ? "red" : "green"}
          icon={CalendarCheck}
        />
      </div>

      {comparison && comparison.cgpa !== null && (
        <Card>
          <CardHeader title="Cohort Comparison" subtitle="CGPA next to the section and the wider semester cohort." icon={Users} />
          <div className="px-5 py-5">
            <BarChart
              bars={[
                { label: "Student", value: comparison.cgpa, color: "#00519c" },
                ...(comparison.section ? [{ label: comparison.section.label, value: comparison.section.avgCgpa ?? 0, color: "#94a3b8" }] : []),
                { label: comparison.semester.label, value: comparison.semester.avgCgpa ?? 0, color: "#cbd5e1" },
              ]}
              max={10}
              height={150}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              {comparison.section && comparison.section.rank !== null && (
                <Badge tone="blue">
                  Section rank #{comparison.section.rank} of {comparison.section.of}
                </Badge>
              )}
              {comparison.semester.rank !== null && (
                <Badge tone="slate">
                  Semester rank #{comparison.semester.rank} of {comparison.semester.of}
                </Badge>
              )}
            </div>
          </div>
        </Card>
      )}

      {attendance && attendance.total > 0 && (
        <Card>
          <CardHeader title="Attendance" subtitle={`${attendance.present} present, ${attendance.late} late, ${attendance.absent} absent — ${attendance.total} day(s) marked.`} icon={CalendarCheck} />
          <ul className="flex flex-wrap gap-1.5 px-5 py-4">
            {attendance.recent.map((r) => (
              <li
                key={r.id}
                title={`${r.date}: ${r.status}`}
                className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-semibold ${
                  r.status === "PRESENT" ? "bg-emerald-100 text-emerald-700" : r.status === "LATE" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                }`}
              >
                {r.status === "PRESENT" ? <CheckCircle2 className="h-4 w-4" /> : r.status === "LATE" ? <Clock className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </li>
            ))}
          </ul>
        </Card>
      )}

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
                <ResponsiveTable
                  table={
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
                  }
                  cards={(results?.results.filter((r) => r.semester === sem) ?? []).map((r) => (
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
                        <span className="text-xs text-slate-400">{r.effective.totalMarks ?? "-"} marks · {r.effective.sourceType}</span>
                        {r.discrepancy && <Badge tone="amber">discrepancy</Badge>}
                      </div>
                    </li>
                  ))}
                />
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
          <ResponsiveTable
            table={
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
            }
            cards={activity.claims.map((c) => (
              <li key={c.claimId} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm text-slate-700">{c.description}</span>
                  <Badge tone={c.status === "APPROVED" ? "green" : c.status === "REJECTED" ? "red" : "amber"}>{c.status}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Requested {c.requestedPoints} · Granted {c.grantedPoints ?? "-"}
                </div>
              </li>
            ))}
          />
        )}
      </Card>

      <Card>
        <CardHeader title={`Accolades${accolades ? ` (${accolades.length})` : ""}`} subtitle="Standout achievements the student has posted themselves." icon={Sparkles} />
        {!accolades || accolades.length === 0 ? (
          <EmptyState message="No accolades posted yet." icon={Sparkles} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {accolades.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{a.title}</span>
                  {a.category && <Badge tone={ACCOLADE_CATEGORY_TONE[a.category] ?? "slate"}>{a.category}</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">{a.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  <span>{new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                  {a.proofFile && (
                    <a href={`/api${a.proofFile}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-600 hover:underline">
                      <Paperclip className="h-3 w-3" />
                      View proof
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Proctor's Notes" subtitle="Private staff remarks — not visible to the student." icon={StickyNote} />
        <div className="border-b border-slate-100 px-5 py-4">
          <form onSubmit={submitNote} className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a remark — e.g. spoke to parents, recommend for scholarship..."
              rows={2}
              className="flex-1"
            />
            <Button type="submit" disabled={addingNote || !noteText.trim()} icon={MessageSquarePlus} className="shrink-0">
              Add
            </Button>
          </form>
        </div>
        {!notes || notes.length === 0 ? (
          <EmptyState message="No notes yet." icon={StickyNote} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-slate-700">{n.note}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {n.author.name} ({n.author.shortCode}) · {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {(auth?.role === "ADMIN" || (auth && "facultyId" in auth.profile && auth.profile.facultyId === n.authorId)) && (
                  <button type="button" onClick={() => deleteNote(n.id)} aria-label="Delete note" className="shrink-0 rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
