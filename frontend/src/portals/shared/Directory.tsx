import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Users, GraduationCap, ArrowRight } from "lucide-react";
import { api } from "../../api/client";
import { Avatar, Badge, Card, CardHeader, EmptyState, Input, PageSpinner, SkeletonRows } from "../../components/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface FacultyRow {
  facultyId: number;
  name: string;
  shortCode: string;
  cabinNo: string | null;
  phone: string | null;
  email: string;
  role: string;
}
interface StudentRow {
  usn: string;
  name: string;
  section: string | null;
}

export default function Directory({ role }: { role: "ADMIN" | "PROCTOR" }) {
  const base = role === "ADMIN" ? "/admin" : "/proctor";
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [faculty, setFaculty] = useState<FacultyRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!debouncedQ.trim()) {
      setSearched(false);
      setFaculty([]);
      setStudents([]);
      return;
    }
    setLoading(true);
    api
      .get(`/directory/search?q=${encodeURIComponent(debouncedQ)}`)
      .then((res) => {
        setFaculty(res.faculty);
        setStudents(res.students);
        setSearched(true);
      })
      .finally(() => setLoading(false));
  }, [debouncedQ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Directory</h1>
        <p className="mt-1 text-sm text-slate-500">Search by short code, faculty name, student name, or USN.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Search the directory..." value={q} onChange={(e) => setQ(e.target.value)} className="py-2.5 pl-10 text-[15px]" autoFocus />
      </div>

      {!searched && !loading ? (
        <Card>
          <EmptyState icon={Search} message="Start typing to search across faculty and students." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Faculty" icon={GraduationCap} subtitle={searched ? `${faculty.length} match${faculty.length === 1 ? "" : "es"}` : undefined} />
            {loading ? (
              <SkeletonRows rows={4} />
            ) : faculty.length === 0 ? (
              <EmptyState message="No faculty matched." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {faculty.map((f) => (
                  <li key={f.facultyId}>
                    <Link to={`${base}/faculty/${f.facultyId}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                      <Avatar name={f.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{f.name}</div>
                        <div className="truncate text-xs text-slate-400">
                          {f.shortCode} · {f.cabinNo ?? "no cabin"} · {f.phone ?? f.email}
                        </div>
                      </div>
                      <Badge tone={f.role === "ADMIN" ? "blue" : "slate"}>{f.role}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Students" icon={Users} subtitle={searched ? `${students.length} match${students.length === 1 ? "" : "es"}` : undefined} />
            {loading ? (
              <SkeletonRows rows={4} />
            ) : students.length === 0 ? (
              <EmptyState message="No students matched." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {students.map((s) => (
                  <li key={s.usn}>
                    <Link to={`${base}/students/${s.usn}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50">
                      <Avatar name={s.name} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">{s.name}</div>
                        <div className="truncate font-mono text-xs text-slate-400">
                          {s.usn} {s.section && `· Sec ${s.section}`}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
