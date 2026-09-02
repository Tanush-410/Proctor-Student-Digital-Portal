import { FormEvent, useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, Info } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, Card, CardHeader, EmptyState, Input, Label, SkeletonRows, Textarea } from "../../components/ui";

interface Ptm {
  ptmId: number;
  ptmDate: string;
  ptmTime: string;
  notes: string | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function Calendar() {
  const toast = useToast();
  const [records, setRecords] = useState<Ptm[] | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api.get("/ptm").then((r) => setRecords(r.sort((a: Ptm, b: Ptm) => (a.ptmDate < b.ptmDate ? 1 : -1))));
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/ptm", { ptmDate: date, ptmTime: time, notes: notes || undefined });
      toast.success("PTM recorded");
      setDate("");
      setTime("");
      setNotes("");
      load();
    } catch (err) {
      toast.error("Couldn't save PTM", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Calendar / PTM</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          A record-keeping surface for parent-teacher meetings — scheduling and notification are out of scope by design.
        </p>
      </div>

      <Card>
        <CardHeader title="Record a PTM" icon={CalendarPlus} />
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
          <div>
            <Label>Date</Label>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Time</Label>
            <Input type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Attendees, topics discussed, follow-ups..." />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy} icon={CalendarPlus}>
              {busy ? "Saving..." : "Record PTM"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="PTM History" icon={CalendarClock} />
        {records === null ? (
          <SkeletonRows rows={3} />
        ) : records.length === 0 ? (
          <EmptyState message="No PTM records yet." icon={CalendarClock} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {records.map((r) => {
              const upcoming = r.ptmDate >= today;
              return (
                <li key={r.ptmId} className="flex items-start gap-3 px-5 py-3.5">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-semibold leading-none ${upcoming ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>
                    <span>{new Date(r.ptmDate + "T00:00:00").toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span>
                    <span className="text-sm">{new Date(r.ptmDate + "T00:00:00").getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {formatDate(r.ptmDate)} <span className="text-slate-400">at {r.ptmTime}</span>
                    </div>
                    {r.notes && <div className="mt-0.5 text-sm text-slate-500">{r.notes}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
