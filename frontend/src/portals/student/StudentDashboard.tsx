import { useEffect, useState } from "react";
import { Award, Building2, CalendarCheck, CalendarClock, CheckCircle2, Download, Eye, GraduationCap, Phone, TrendingUp, Users, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Card, CardHeader, EmptyState, IconButton, Skeleton, StatTile } from "../../components/ui";
import { BarChart, LineChart } from "../../components/charts";
import { DashboardHero } from "../../components/DashboardHero";

interface Proctor {
  name: string;
  shortCode: string;
  email: string;
  cabinNo: string | null;
  phone: string | null;
}

interface Comparison {
  cgpa: number | null;
  backlogs: number;
  section: { label: string; avgCgpa: number | null; percentile: number | null; rank: number | null; of: number } | null;
  semester: { label: string; avgCgpa: number | null; percentile: number | null; rank: number | null; of: number };
}

interface Ptm {
  ptmId: number;
  ptmDate: string;
  ptmTime: string;
  notes: string | null;
}

interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  late: number;
  percentage: number | null;
}

export default function StudentDashboard() {
  const { auth } = useAuth();
  const toast = useToast();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [backlogs, setBacklogs] = useState<number | null>(null);
  const [sgpaBySemester, setSgpaBySemester] = useState<Record<string, number | null>>({});
  const [points, setPoints] = useState<number | null>(null);
  const [proctor, setProctor] = useState<Proctor | null>(null);
  const [proctorLoaded, setProctorLoaded] = useState(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [ptms, setPtms] = useState<Ptm[] | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);

  useEffect(() => {
    if (!usn) return;
    api.get(`/students/${usn}/results/effective`).then((r) => {
      setCgpa(r.cgpa);
      setBacklogs(r.backlogSubjects.length);
      setSgpaBySemester(r.sgpaBySemester);
    });
    api.get(`/students/${usn}/activity-points`).then((r) => setPoints(r.runningTotal));
    api.get(`/students/${usn}/analytics/comparison`).then(setComparison);
    api.get(`/students/${usn}/attendance/summary`).then(setAttendance);
    api.get("/ptm").then((r) => setPtms(r.sort((a: Ptm, b: Ptm) => (a.ptmDate < b.ptmDate ? 1 : -1)).slice(0, 5)));
    api
      .get("/proctors")
      .then((r) => setProctor(r[0] ?? null))
      .finally(() => setProctorLoaded(true));
  }, [usn]);

  const name = auth && "name" in auth.profile ? auth.profile.name : "";
  const firstName = name.split(" ")[0];

  async function downloadPtmPdf(id: number) {
    setDownloadingId(id);
    try {
      const blob = await api.downloadPdf(`/ptm/${id}/report`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't generate PDF", "Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  const trendPoints = Object.entries(sgpaBySemester)
    .filter(([, v]) => v !== null)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([sem, v]) => ({ label: `S${sem}`, value: v as number }));

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="BMS College of Engineering — Student Portal"
        title={`Welcome, ${firstName}`}
        subtitle="Your academic snapshot, at a glance."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile index={0} label="CGPA" value={cgpa ?? "N/A"} tone="blue" icon={GraduationCap} loading={cgpa === null} />
        <StatTile index={1} label="Backlog Subjects" value={backlogs ?? 0} tone={backlogs ? "red" : "green"} icon={backlogs ? XCircle : CheckCircle2} loading={backlogs === null} />
        <StatTile index={2} label="Activity Points" value={points ?? 0} tone="amber" icon={Award} loading={points === null} />
        <StatTile index={3}
          label="Attendance"
          value={attendance?.percentage !== null && attendance?.percentage !== undefined ? `${attendance.percentage}%` : "N/A"}
          tone={attendance?.percentage !== null && attendance !== null && attendance.percentage! < 75 ? "red" : "green"}
          icon={CalendarCheck}
          loading={attendance === null}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="SGPA Trend" subtitle="Semester-wise, from your effective (precedence-resolved) results." icon={TrendingUp} />
          <div className="px-5 py-5">
            {trendPoints.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">No results recorded yet.</p>
            ) : (
              <LineChart points={trendPoints} max={10} refValue={cgpa ?? undefined} height={170} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Where You Stand" subtitle="Your CGPA next to your section and the wider semester cohort." icon={Users} />
          <div className="px-5 py-5">
            {!comparison || comparison.cgpa === null ? (
              <p className="py-10 text-center text-sm text-slate-400">Not enough data yet.</p>
            ) : (
              <>
                <BarChart
                  bars={[
                    { label: "You", value: comparison.cgpa, color: "#00519c" },
                    ...(comparison.section ? [{ label: comparison.section.label, value: comparison.section.avgCgpa ?? 0, color: "#94a3b8" }] : []),
                    { label: "Sem. Avg", value: comparison.semester.avgCgpa ?? 0, color: "#cbd5e1" },
                  ]}
                  max={10}
                  height={150}
                />
                <div className="mt-4 flex flex-wrap gap-2">
                  {comparison.section && comparison.section.percentile !== null && (
                    <Badge tone="blue">
                      Section: top {100 - comparison.section.percentile}% (#{comparison.section.rank} of {comparison.section.of})
                    </Badge>
                  )}
                  {comparison.semester.percentile !== null && (
                    <Badge tone="slate">
                      Semester: top {100 - comparison.semester.percentile}% (#{comparison.semester.rank} of {comparison.semester.of})
                    </Badge>
                  )}
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="My Proctor" icon={Building2} />
          <div className="px-5 py-4">
            {!proctorLoaded ? (
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ) : proctor ? (
              <div className="flex items-center gap-3.5">
                <Avatar name={proctor.name} />
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {proctor.name} <span className="text-slate-400">({proctor.shortCode})</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> Cabin {proctor.cabinNo ?? "-"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {proctor.phone ?? proctor.email}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No proctor assigned yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recent PTM History" icon={CalendarClock} />
          {ptms === null ? (
            <div className="space-y-3 px-5 py-4">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </div>
          ) : ptms.length === 0 ? (
            <EmptyState message="No PTM records yet." icon={CalendarClock} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ptms.map((p) => (
                <li key={p.ptmId} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1 font-medium text-slate-800">
                    {new Date(p.ptmDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at {p.ptmTime}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a href={`/ptm/${p.ptmId}`} target="_blank" rel="noreferrer">
                      <IconButton icon={Eye} label="View PTM record" size="sm" />
                    </a>
                    <IconButton icon={Download} label="Download PDF" size="sm" onClick={() => downloadPtmPdf(p.ptmId)} disabled={downloadingId === p.ptmId} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
