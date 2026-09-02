import { useEffect, useState } from "react";
import { Award, Building2, CheckCircle2, GraduationCap, Phone, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/client";
import { Avatar, Card, CardHeader, Skeleton, StatTile } from "../../components/ui";

interface Proctor {
  name: string;
  shortCode: string;
  email: string;
  cabinNo: string | null;
  phone: string | null;
}

export default function StudentDashboard() {
  const { auth } = useAuth();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [cgpa, setCgpa] = useState<number | null>(null);
  const [backlogs, setBacklogs] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [proctor, setProctor] = useState<Proctor | null>(null);
  const [proctorLoaded, setProctorLoaded] = useState(false);

  useEffect(() => {
    if (!usn) return;
    api.get(`/students/${usn}/results/effective`).then((r) => {
      setCgpa(r.cgpa);
      setBacklogs(r.backlogSubjects.length);
    });
    api.get(`/students/${usn}/activity-points`).then((r) => setPoints(r.runningTotal));
    api
      .get("/proctors")
      .then((r) => setProctor(r[0] ?? null))
      .finally(() => setProctorLoaded(true));
  }, [usn]);

  const name = auth && "name" in auth.profile ? auth.profile.name : "";
  const firstName = name.split(" ")[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Welcome, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">Your academic snapshot, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="CGPA" value={cgpa ?? "N/A"} tone="blue" icon={GraduationCap} loading={cgpa === null} />
        <StatTile label="Backlog Subjects" value={backlogs ?? 0} tone={backlogs ? "red" : "green"} icon={backlogs ? XCircle : CheckCircle2} loading={backlogs === null} />
        <StatTile label="Activity Points" value={points ?? 0} tone="amber" icon={Award} loading={points === null} />
      </div>

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
    </div>
  );
}
