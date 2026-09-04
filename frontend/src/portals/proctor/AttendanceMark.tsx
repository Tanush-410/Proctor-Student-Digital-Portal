import { useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Save, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Label, SkeletonRows } from "../../components/ui";

type Status = "PRESENT" | "ABSENT" | "LATE";

interface StudentRow {
  usn: string;
  name: string;
  section: string | null;
}

interface AttendanceRow {
  usn: string;
  date: string;
  status: Status;
}

const STATUS_STYLES: Record<Status, { tone: "green" | "red" | "amber"; icon: typeof CheckCircle2 }> = {
  PRESENT: { tone: "green", icon: CheckCircle2 },
  ABSENT: { tone: "red", icon: XCircle },
  LATE: { tone: "amber", icon: Clock },
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendanceMark() {
  const toast = useToast();
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);

  useEffect(() => {
    api.get("/students?mine=true").then(setStudents);
  }, []);

  useEffect(() => {
    if (!students) return;
    setLoadingExisting(true);
    api
      .get(`/attendance?date=${date}`)
      .then((rows: AttendanceRow[]) => {
        const existing = Object.fromEntries(rows.map((r) => [r.usn, r.status]));
        setMarks(Object.fromEntries(students.map((s) => [s.usn, existing[s.usn] ?? "PRESENT"])));
      })
      .finally(() => setLoadingExisting(false));
  }, [students, date]);

  function setStatus(usn: string, status: Status) {
    setMarks((prev) => ({ ...prev, [usn]: status }));
  }
  function markAll(status: Status) {
    if (!students) return;
    setMarks(Object.fromEntries(students.map((s) => [s.usn, status])));
  }

  async function save() {
    if (!students || students.length === 0) return;
    setSaving(true);
    try {
      const res = await api.post("/attendance/mark", {
        date,
        records: students.map((s) => ({ usn: s.usn, status: marks[s.usn] ?? "PRESENT" })),
      });
      toast.success(`Attendance saved for ${res.marked} student(s)`, res.skipped.length ? `${res.skipped.length} skipped.` : undefined);
    } catch (err) {
      toast.error("Couldn't save attendance", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const counts = students
    ? students.reduce(
        (acc, s) => {
          const st = marks[s.usn] ?? "PRESENT";
          acc[st]++;
          return acc;
        },
        { PRESENT: 0, ABSENT: 0, LATE: 0 } as Record<Status, number>
      )
    : { PRESENT: 0, ABSENT: 0, LATE: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Mark Attendance</h1>
        <p className="mt-1 text-sm text-slate-500">Daily attendance for your proctees — re-marking a date corrects it rather than duplicating it.</p>
      </div>

      <Card>
        <CardHeader
          title="Roster"
          icon={CalendarCheck}
          action={
            <div className="w-40">
              <Label>Date</Label>
              <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
            </div>
          }
        />
        {students === null || loadingExisting ? (
          <SkeletonRows rows={6} />
        ) : students.length === 0 ? (
          <EmptyState message="No proctees allocated yet." />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">{counts.PRESENT} present</Badge>
                <Badge tone="red">{counts.ABSENT} absent</Badge>
                <Badge tone="amber">{counts.LATE} late</Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => markAll("PRESENT")}>
                  Mark all present
                </Button>
                <Button onClick={save} disabled={saving} icon={Save} size="sm">
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-slate-100">
              {students.map((s) => {
                const status = marks[s.usn] ?? "PRESENT";
                return (
                  <li key={s.usn} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.name} size="sm" />
                      <div>
                        <div className="text-sm font-medium text-slate-800">{s.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {s.usn} {s.section && `· Sec ${s.section}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      {(["PRESENT", "LATE", "ABSENT"] as Status[]).map((st) => {
                        const active = status === st;
                        const { tone, icon: Icon } = STATUS_STYLES[st];
                        return (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setStatus(s.usn, st)}
                            aria-pressed={active}
                            aria-label={`Mark ${s.name} ${st.toLowerCase()}`}
                            className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? tone === "green"
                                  ? "bg-emerald-600 text-white"
                                  : tone === "red"
                                    ? "bg-red-600 text-white"
                                    : "bg-amber-500 text-white"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {st === "PRESENT" ? "P" : st === "ABSENT" ? "A" : "L"}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
