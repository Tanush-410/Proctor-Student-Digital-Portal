import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Download, FileClock, Layers, Trophy, Users } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../components/Toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Density,
  DensityToggle,
  DENSITY_PAD,
  EmptyState,
  PageSpinner,
  ResponsiveTable,
  SortableTh,
  StatRowCard,
  StatTile,
  StickyScrollTable,
  useSort,
} from "../../components/ui";
import { BarChart } from "../../components/charts";

interface SectionStat {
  section: string;
  totalPoints: number;
  studentCount: number;
}
interface LeaderboardEntry {
  usn: string;
  name: string;
  section: string | null;
  points: number;
}
interface Analytics {
  totalStudents: number;
  totalClaims: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalApprovedPoints: number;
  bySection: SectionStat[];
  leaderboard: LeaderboardEntry[];
}
interface MatrixRow {
  usn: string;
  name: string;
  section: string | null;
  bySemester: Record<string, number>;
  total: number;
}

const RANK_TONE: ("blue" | "slate")[] = ["blue", "blue", "blue"];
const SEMESTERS = [1, 2, 3, 4];

export default function AdminActivityPoints() {
  const toast = useToast();
  const [data, setData] = useState<Analytics | null>(null);
  const [matrix, setMatrix] = useState<MatrixRow[] | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const { sorted: sortedMatrix, sortKey, dir, toggle } = useSort<MatrixRow>(matrix ?? [], (row, key) => {
    if (key === "name") return row.name;
    if (key === "total") return row.total;
    return row.bySemester[key] ?? -1;
  });

  useEffect(() => {
    api.get("/admin/activity-points/analytics").then(setData);
    api.get("/admin/activity-points/matrix").then((d) => setMatrix(d.rows));
  }, []);

  async function downloadReport() {
    setDownloading(true);
    try {
      const blob = await api.downloadPdf("/admin/activity-points/report");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      toast.success("Report ready", "Opened the Activity Points report in a new tab.");
    } catch {
      toast.error("Couldn't generate report", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (!data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Activity Points</h1>
          <p className="mt-1 text-sm text-slate-500">Department-wide claim totals, by section and by student.</p>
        </div>
        <Button onClick={downloadReport} disabled={downloading} icon={Download}>
          {downloading ? "Preparing..." : "Download Report"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile index={0} label="Students" value={data.totalStudents} icon={Users} />
        <StatTile index={1} label="Total Approved Points" value={data.totalApprovedPoints} tone="blue" icon={Award} />
        <StatTile index={2} label="Pending Claims" value={data.pendingCount} tone={data.pendingCount > 0 ? "amber" : "green"} icon={FileClock} />
        <StatTile index={3} label="Approved / Rejected" value={`${data.approvedCount} / ${data.rejectedCount}`} icon={Layers} />
      </div>

      <Card>
        <CardHeader title="Approved Points by Section" icon={Layers} />
        <div className="px-5 py-5">
          {data.bySection.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No students recorded yet.</p>
          ) : (
            <BarChart bars={data.bySection.map((s) => ({ label: s.section, value: s.totalPoints }))} height={200} />
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="By Section" icon={Layers} />
        <ResponsiveTable
          table={
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Section</th>
                  <th className="px-5 py-2.5 font-medium">Students</th>
                  <th className="px-5 py-2.5 font-medium">Total Points</th>
                </tr>
              </thead>
              <tbody>
                {data.bySection.map((s) => (
                  <tr key={s.section} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{s.section}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.studentCount}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={data.bySection.map((s) => (
            <StatRowCard
              key={s.section}
              title={`Section ${s.section}`}
              stats={[
                { label: "Students", value: s.studentCount },
                { label: "Points", value: s.totalPoints },
              ]}
            />
          ))}
        />
      </Card>

      <Card>
        <CardHeader
          title="By Student, By Semester"
          subtitle="Approved points claimed each semester, per student. Click a column to sort."
          icon={Award}
          action={matrix && matrix.length > 0 ? <DensityToggle density={density} onChange={setDensity} /> : undefined}
        />
        {!matrix ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading...</div>
        ) : matrix.length === 0 ? (
          <EmptyState message="No students recorded yet." icon={Award} />
        ) : (
          <StickyScrollTable>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 shadow-[0_1px_0_0_theme(colors.slate.200)]">
                <tr>
                  <SortableTh sortKey="name" activeKey={sortKey} dir={dir} onSort={toggle} className="whitespace-nowrap">
                    Student
                  </SortableTh>
                  {SEMESTERS.map((s) => (
                    <SortableTh key={s} sortKey={String(s)} activeKey={sortKey} dir={dir} onSort={toggle} align="right" className="whitespace-nowrap">
                      Sem {s}
                    </SortableTh>
                  ))}
                  <SortableTh sortKey="total" activeKey={sortKey} dir={dir} onSort={toggle} align="right" className="whitespace-nowrap">
                    Total
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedMatrix.map((row) => (
                  <tr key={row.usn} className="border-t border-slate-100">
                    <td className={`whitespace-nowrap px-5 ${DENSITY_PAD[density]}`}>
                      <Link to={`/admin/students/${row.usn}`} className="font-medium text-slate-800 hover:underline">
                        {row.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">
                        {row.usn} {row.section && `· Sec ${row.section}`}
                      </div>
                    </td>
                    {SEMESTERS.map((s) => (
                      <td key={s} className={`px-3 ${DENSITY_PAD[density]} text-right text-slate-600`}>
                        {row.bySemester[String(s)] ?? "-"}
                      </td>
                    ))}
                    <td className={`px-5 ${DENSITY_PAD[density]} text-right`}>
                      <Badge tone={row.total > 0 ? "blue" : "slate"}>{row.total}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StickyScrollTable>
        )}
      </Card>

      <Card>
        <CardHeader title="Leaderboard" subtitle="Top students by total approved points." icon={Trophy} />
        {data.leaderboard.length === 0 ? (
          <EmptyState message="No approved claims yet." icon={Trophy} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.leaderboard.map((s, i) => (
              <li key={s.usn}>
                <Link to={`/admin/students/${s.usn}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </div>
                  <Avatar name={s.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                    <div className="truncate font-mono text-[11px] text-slate-400">
                      {s.usn} {s.section && `· Sec ${s.section}`}
                    </div>
                  </div>
                  <Badge tone={i < 3 ? RANK_TONE[i] : "slate"}>{s.points} pts</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
