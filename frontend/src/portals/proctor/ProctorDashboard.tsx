import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CalendarClock, Search, Users } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/client";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, SkeletonRows, StatTile } from "../../components/ui";

interface StudentRow {
  usn: string;
  name: string;
  section: string | null;
  currentSemester: number;
}

export default function ProctorDashboard() {
  const { auth } = useAuth();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [pendingClaims, setPendingClaims] = useState<number | null>(null);
  const [upcomingPtms, setUpcomingPtms] = useState<number | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/students?mine=true").then(setStudents);
    api.get("/activity-points/claims?status=pending").then((r) => setPendingClaims(r.length));
    api.get("/ptm").then((r) => setUpcomingPtms(r.filter((p: any) => p.ptmDate >= new Date().toISOString().slice(0, 10)).length));
  }, []);

  const filtered = useMemo(() => {
    if (!students) return [];
    const query = q.trim().toLowerCase();
    if (!query) return students;
    return students.filter((s) => s.name.toLowerCase().includes(query) || s.usn.toLowerCase().includes(query));
  }, [students, q]);

  const firstName = auth?.profile.name.replace(/^(Dr\.|Prof\.)\s*/, "").split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Welcome back, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">Your proctees and what needs your attention.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Proctees" value={students?.length ?? 0} tone="blue" icon={Users} loading={students === null} />
        <StatTile label="Pending Claims" value={pendingClaims ?? 0} tone={pendingClaims ? "amber" : "green"} icon={Award} loading={pendingClaims === null} />
        <StatTile label="Upcoming PTMs" value={upcomingPtms ?? 0} icon={CalendarClock} loading={upcomingPtms === null} />
      </div>

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
                  <th className="px-5 py-2.5 font-medium">Student</th>
                  <th className="px-5 py-2.5 font-medium">Section</th>
                  <th className="px-5 py-2.5 font-medium">Semester</th>
                  <th className="px-5 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.usn} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
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
    </div>
  );
}
