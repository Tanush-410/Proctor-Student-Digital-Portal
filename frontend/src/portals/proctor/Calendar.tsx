import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock, CalendarPlus, Download, Eye, Info, Trash2, UserRound } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, Card, CardHeader, EmptyState, IconButton, Input, Label, Select, SkeletonRows } from "../../components/ui";
import { ConfirmModal } from "../../components/Modal";
import { isEmptyHtml, RichTextEditor } from "../../components/RichTextEditor";

interface Ptm {
  ptmId: number;
  ptmDate: string;
  ptmTime: string;
  notes: string | null;
  usn: string | null;
  student: { name: string; usn: string; section: string | null } | null;
}

interface StudentRow {
  usn: string;
  name: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function Calendar() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [records, setRecords] = useState<Ptm[] | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [usn, setUsn] = useState(searchParams.get("usn") ?? "");
  const [busy, setBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ptm | null>(null);
  const [deleting, setDeleting] = useState(false);

  function load() {
    api.get("/ptm").then((r) => setRecords(r.sort((a: Ptm, b: Ptm) => (a.ptmDate < b.ptmDate ? 1 : -1))));
  }

  useEffect(load, []);
  useEffect(() => {
    api.get("/students?mine=true").then(setStudents);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/ptm", { ptmDate: date, ptmTime: time, notes: isEmptyHtml(notes) ? undefined : notes, usn: usn || undefined });
      toast.success("PTM recorded");
      setDate("");
      setTime("");
      setNotes("");
      setEditorKey((k) => k + 1);
      setUsn("");
      load();
    } catch (err) {
      toast.error("Couldn't save PTM", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf(r: Ptm) {
    setDownloadingId(r.ptmId);
    try {
      const blob = await api.downloadPdf(`/ptm/${r.ptmId}/report`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't generate PDF", "Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/ptm/${deleteTarget.ptmId}`);
      toast.success("PTM record deleted");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error("Couldn't delete", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setDeleting(false);
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
          <div>
            <Label>For Student (optional)</Label>
            <Select value={usn} onChange={(e) => setUsn(e.target.value)}>
              <option value="">General / not tied to one student</option>
              {students.map((s) => (
                <option key={s.usn} value={s.usn}>
                  {s.name} ({s.usn})
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-3">
            <Label>Notes</Label>
            <RichTextEditor key={editorKey} content={notes} onChange={setNotes} />
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
                <li key={r.ptmId} className="flex items-center gap-3 px-5 py-3.5">
                  <div className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg text-[10px] font-semibold leading-none ${upcoming ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>
                    <span>{new Date(r.ptmDate + "T00:00:00").toLocaleDateString(undefined, { month: "short" }).toUpperCase()}</span>
                    <span className="text-sm">{new Date(r.ptmDate + "T00:00:00").getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{r.student ? `${r.student.name} (${r.student.usn})` : "General meeting"}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {formatDate(r.ptmDate)} at {r.ptmTime}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a href={`/ptm/${r.ptmId}`} target="_blank" rel="noreferrer">
                      <IconButton icon={Eye} label="View PTM record" />
                    </a>
                    <IconButton icon={Download} label="Download PDF" onClick={() => downloadPdf(r)} disabled={downloadingId === r.ptmId} />
                    <IconButton icon={Trash2} label="Delete PTM record" tone="danger" onClick={() => setDeleteTarget(r)} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete PTM record?"
        description={`This permanently removes the ${deleteTarget ? formatDate(deleteTarget.ptmDate) : ""} record${
          deleteTarget?.student ? ` for ${deleteTarget.student.name}` : ""
        }, including its notes. This can't be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
