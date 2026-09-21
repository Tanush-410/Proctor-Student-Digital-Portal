import { useEffect, useState } from "react";
import { AlertTriangle, CalendarCheck, GraduationCap, Layers, Users, XCircle } from "lucide-react";
import { api } from "../../api/client";
import { Card, CardHeader, PageSpinner, ResponsiveTable, StatRowCard, StatTile } from "../../components/ui";
import { BarChart } from "../../components/charts";

interface GroupStat {
  studentCount: number;
  avgCgpa: number | null;
  backlogCount: number;
  atRiskCount: number;
}
interface SectionStat extends GroupStat {
  section: string;
}
interface SemesterStat extends GroupStat {
  semester: number;
}
interface Analytics extends GroupStat {
  bySection: SectionStat[];
  bySemester: SemesterStat[];
}

interface AttendanceAnalytics {
  from: string;
  to: string;
  recordCount: number;
  overallPercentage: number | null;
  bySection: { section: string; percentage: number | null; recordCount: number }[];
}

export default function AdminAnalytics() {
  const [data, setData] = useState<Analytics | null>(null);
  const [attendance, setAttendance] = useState<AttendanceAnalytics | null>(null);

  useEffect(() => {
    api.get("/admin/analytics").then(setData);
    api.get("/admin/attendance/analytics").then(setAttendance);
  }, []);

  if (!data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Department Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">CGPA, backlogs, and at-risk counts across every student — the per-proctor rollup, aggregated.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile index={0} label="Students" value={data.studentCount} icon={Users} />
        <StatTile index={1} label="Avg. CGPA" value={data.avgCgpa ?? "N/A"} tone="blue" icon={GraduationCap} />
        <StatTile index={2} label="Total Backlogs" value={data.backlogCount} tone={data.backlogCount > 0 ? "red" : "green"} icon={XCircle} />
        <StatTile index={3} label="At-Risk Students" value={data.atRiskCount} tone={data.atRiskCount > 0 ? "amber" : "green"} icon={AlertTriangle} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Avg. CGPA by Semester" icon={Layers} />
          <div className="px-5 py-5">
            {data.bySemester.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No data yet.</p>
            ) : (
              <BarChart bars={data.bySemester.map((s) => ({ label: `Sem ${s.semester}`, value: s.avgCgpa ?? 0 }))} max={10} height={200} />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Avg. CGPA by Section" icon={Layers} />
          <div className="px-5 py-5">
            {data.bySection.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No data yet.</p>
            ) : (
              <BarChart bars={data.bySection.map((s) => ({ label: s.section, value: s.avgCgpa ?? 0 }))} max={10} height={200} />
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="By Semester" icon={Layers} />
        <ResponsiveTable
          table={
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Semester</th>
                  <th className="px-5 py-2.5 font-medium">Students</th>
                  <th className="px-5 py-2.5 font-medium">Avg. CGPA</th>
                  <th className="px-5 py-2.5 font-medium">Backlogs</th>
                  <th className="px-5 py-2.5 font-medium">At-Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.bySemester.map((s) => (
                  <tr key={s.semester} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 font-medium text-slate-800">Semester {s.semester}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.studentCount}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.avgCgpa ?? "N/A"}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.backlogCount}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.atRiskCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          cards={data.bySemester.map((s) => (
            <StatRowCard
              key={s.semester}
              title={`Semester ${s.semester}`}
              stats={[
                { label: "Students", value: s.studentCount },
                { label: "Avg CGPA", value: s.avgCgpa ?? "N/A" },
                { label: "Backlogs", value: s.backlogCount },
                { label: "At-Risk", value: s.atRiskCount },
              ]}
            />
          ))}
        />
      </Card>

      {attendance && (
        <Card>
          <CardHeader title="Attendance — Last 30 Days" subtitle={`${attendance.recordCount} record(s) marked, ${attendance.from} to ${attendance.to}.`} icon={CalendarCheck} />
          {attendance.bySection.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-400">No attendance marked in this window yet.</p>
          ) : (
            <>
              <div className="px-5 py-5">
                <BarChart bars={attendance.bySection.map((s) => ({ label: s.section, value: s.percentage ?? 0, color: (s.percentage ?? 0) < 75 ? "#dc2626" : "#00519c" }))} max={100} height={180} valueSuffix="%" />
              </div>
              <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                Overall: <span className="font-semibold text-slate-800">{attendance.overallPercentage ?? "N/A"}%</span>
              </div>
            </>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="By Section" icon={Layers} />
        <ResponsiveTable
          table={
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Section</th>
                  <th className="px-5 py-2.5 font-medium">Students</th>
                  <th className="px-5 py-2.5 font-medium">Avg. CGPA</th>
                  <th className="px-5 py-2.5 font-medium">Backlogs</th>
                  <th className="px-5 py-2.5 font-medium">At-Risk</th>
                </tr>
              </thead>
              <tbody>
                {data.bySection.map((s) => (
                  <tr key={s.section} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{s.section}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.studentCount}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.avgCgpa ?? "N/A"}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.backlogCount}</td>
                    <td className="px-5 py-2.5 text-slate-600">{s.atRiskCount}</td>
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
                { label: "Avg CGPA", value: s.avgCgpa ?? "N/A" },
                { label: "Backlogs", value: s.backlogCount },
                { label: "At-Risk", value: s.atRiskCount },
              ]}
            />
          ))}
        />
      </Card>
    </div>
  );
}
