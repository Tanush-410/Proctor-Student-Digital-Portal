import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Award, CalendarClock, CalendarPlus, Download, GraduationCap, MessageSquarePlus, Search, Users, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Label, SkeletonRows, StatTile, Textarea } from "../../components/ui";
import { DashboardHero } from "../../components/DashboardHero";

interface StudentRow {
  usn: string;
  name: string;
  section: string | null;
  currentSemester: number;
}

interface AtRisk {
  usn: string;
  name: string;
  section: string | null;
  cgpa: number | null;
  backlogs: number;
}

interface Analytics {
  proctee_count: number;
  avgCgpa: number | null;
  backlogCount: number;
  pendingClaims: number;
  atRisk: AtRisk[];
}

function downloadCsv(filename: string, rows: StudentRow[]) {
  const header = "USN,Name,Section,Semester";
  const lines = rows.map((s) => [s.usn, s.name, s.section ?? "", s.currentSemester].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProctorDashboard() {
  const { auth } = useAuth();
  const toast = useToast();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [pendingClaims, setPendingClaims] = useState<number | null>(null);
  const [upcomingPtms, setUpcomingPtms] = useState<number | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"ptm" | "note" | null>(null);
  const [bulkDate, setBulkDate] = useState("");
  const [bulkTime, setBulkTime] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);

  function load() {
    api.get("/students?mine=true").then(setStudents);
    api.get("/activity-points/claims?status=pending").then((r) => setPendingClaims(r.length));
    api.get("/ptm").then((r) => setUpcomingPtms(r.filter((p: any) => p.ptmDate >= new Date().toISOString().slice(0, 10)).length));
    if (auth?.profile && "facultyId" in auth.profile) {
      api.get(`/proctors/${auth.profile.facultyId}/analytics`).then(setAnalytics);
    }
  }

  useEffect(load, [auth]);

  const filtered = useMemo(() => {
    if (!students) return [];
    const query = q.trim().toLowerCase();
    if (!query) return students;
    return students.filter((s) => s.name.toLowerCase().includes(query) || s.usn.toLowerCase().includes(query));
  }, [students, q]);

  const firstName = auth?.profile.name.replace(/^(Dr\.|Prof\.)\s*/, "").split(" ")[0];

  function toggle(usn: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(usn)) next.delete(usn);
      else next.add(usn);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((s) => s.usn))));
  }
  function closeBulkModal() {
    setBulkModal(null);
    setBulkDate("");
    setBulkTime("");
    setBulkText("");
  }

  async function submitBulkPtm(e: FormEvent) {
    e.preventDefault();
    setBulkBusy(true);
    try {
      const res = await api.post("/ptm/bulk", { ptmDate: bulkDate, ptmTime: bulkTime, notes: bulkText || undefined, usns: [...selected] });
      toast.success(`PTM logged for ${res.created} student(s)`, res.skipped.length ? `${res.skipped.length} skipped.` : undefined);
      closeBulkModal();
      setSelected(new Set());
      load();
    } catch (err) {
      toast.error("Couldn't log PTM", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function submitBulkNote(e: FormEvent) {
    e.preventDefault();
    setBulkBusy(true);
    try {
      const res = await api.post("/students/notes/bulk", { note: bulkText, usns: [...selected] });
      toast.success(`Note added for ${res.created} student(s)`, res.skipped.length ? `${res.skipped.length} skipped.` : undefined);
      closeBulkModal();
      setSelected(new Set());
    } catch (err) {
      toast.error("Couldn't add note", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="BMS College of Engineering — Proctor Portal"
        title={`Welcome back, ${firstName}`}
        subtitle="Your proctees and what needs your attention."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Proctees" value={students?.length ?? 0} tone="blue" icon={Users} loading={students === null} />
        <StatTile label="Pending Claims" value={pendingClaims ?? 0} tone={pendingClaims ? "amber" : "green"} icon={Award} loading={pendingClaims === null} />
        <StatTile label="Upcoming PTMs" value={upcomingPtms ?? 0} icon={CalendarClock} loading={upcomingPtms === null} />
        <StatTile label="Avg. CGPA" value={analytics?.avgCgpa ?? "N/A"} tone="blue" icon={GraduationCap} loading={analytics === null} />
        <StatTile label="Backlogs" value={analytics?.backlogCount ?? 0} tone={analytics && analytics.backlogCount > 0 ? "red" : "green"} icon={XCircle} loading={analytics === null} />
        <StatTile label="At Risk" value={analytics?.atRisk.length ?? 0} tone={analytics && analytics.atRisk.length > 0 ? "amber" : "green"} icon={AlertTriangle} loading={analytics === null} />
      </div>

      {analytics && analytics.atRisk.length > 0 && (
        <Card>
          <CardHeader title="At-Risk Students" subtitle="Backlogs, or a CGPA below 6 — worth checking in on first." icon={AlertTriangle} />
          <ul className="divide-y divide-slate-100">
            {analytics.atRisk.map((s) => (
              <li key={s.usn}>
                <Link to={`/proctor/students/${s.usn}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={s.name} size="sm" />
                    <div>
                      <div className="font-medium text-slate-800">{s.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        {s.usn} {s.section && `· Sec ${s.section}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="blue">CGPA {s.cgpa ?? "N/A"}</Badge>
                    {s.backlogs > 0 && <Badge tone="red">{s.backlogs} backlog{s.backlogs > 1 ? "s" : ""}</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader
          title="My Proctees"
          icon={Users}
          action={
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input placeholder="Filter..." value={q} onChange={(e) => setQ(e.target.value)} className="w-36 py-1.5 pl-8 text-sm sm:w-44" />
              </div>
              {students && students.length > 0 && (
                <Button variant="secondary" size="sm" icon={Download} onClick={() => downloadCsv("proctees.csv", students)}>
                  Export CSV
                </Button>
              )}
              {selected.size > 0 && (
                <>
                  <Button variant="secondary" size="sm" icon={CalendarPlus} onClick={() => setBulkModal("ptm")}>
                    Log PTM ({selected.size})
                  </Button>
                  <Button variant="secondary" size="sm" icon={MessageSquarePlus} onClick={() => setBulkModal("note")}>
                    Add Note ({selected.size})
                  </Button>
                </>
              )}
              {!!pendingClaims && (
                <Link to="/proctor/activity-points">
                  <Button variant="secondary" size="sm">
                    Review Claims
                  </Button>
                </Link>
              )}
            </div>
          }
        />
        {students === null ? (
          <SkeletonRows rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState message={students.length === 0 ? "No proctees allocated yet — check the Admin's Upload/Exceptions flow." : "No proctees matched."} icon={Users} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="w-10 px-5 py-2.5">
                    <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleAll} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/40" />
                  </th>
                  <th className="px-5 py-2.5 font-medium">Student</th>
                  <th className="px-5 py-2.5 font-medium">Section</th>
                  <th className="px-5 py-2.5 font-medium">Semester</th>
                  <th className="px-5 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.usn} className={`border-t border-slate-100 transition-colors hover:bg-slate-50/70 ${selected.has(s.usn) ? "bg-brand-50/40" : ""}`}>
                    <td className="px-5 py-2.5">
                      <input type="checkbox" checked={selected.has(s.usn)} onChange={() => toggle(s.usn)} className="rounded border-slate-300 text-brand-600 focus:ring-brand-500/40" />
                    </td>
                    <td className="px-5 py-2.5">
                      <Link to={`/proctor/students/${s.usn}`} className="flex items-center gap-2.5 group">
                        <Avatar name={s.name} size="sm" />
                        <div>
                          <div className="font-medium text-slate-800 group-hover:text-brand-700">{s.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{s.usn}</div>
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-2.5">
                      <Badge>{s.section ?? "-"}</Badge>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{s.currentSemester}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Link to={`/proctor/students/${s.usn}`}>
                        <Button variant="secondary" size="sm">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={bulkModal === "ptm"} onClose={closeBulkModal} title={`Log PTM for ${selected.size} student(s)`}>
        <form onSubmit={submitBulkPtm} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" required value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" required value={bulkTime} onChange={(e) => setBulkTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="Shared context for this meeting..." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeBulkModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={bulkBusy}>
              {bulkBusy ? "Saving..." : "Log PTM"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={bulkModal === "note"} onClose={closeBulkModal} title={`Add a note for ${selected.size} student(s)`}>
        <form onSubmit={submitBulkNote} className="space-y-4">
          <div>
            <Label>Note</Label>
            <Textarea rows={3} required value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="e.g. Attended the semester kickoff meeting." />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeBulkModal}>
              Cancel
            </Button>
            <Button type="submit" disabled={bulkBusy || !bulkText.trim()}>
              {bulkBusy ? "Saving..." : "Add Note"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
