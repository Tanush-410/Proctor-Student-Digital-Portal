import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Clock, FileSpreadsheet, SendHorizontal, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select, SkeletonRows, Textarea } from "../../components/ui";

interface SubjectOption {
  subjectCode: string;
  subjectName: string | null;
  semester: number;
  grade: string | null;
  totalMarks: number | null;
}

interface MarkRequestRow {
  id: number;
  subjectCode: string;
  subjectName: string | null;
  semester: number;
  requestType: string;
  reason: string | null;
  proposedTotal: number | null;
  proposedGrade: string | null;
  proofFile: string | null;
  status: string;
  remarks: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export default function MarkRequestsStudent() {
  const { auth } = useAuth();
  const toast = useToast();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";

  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [requests, setRequests] = useState<MarkRequestRow[] | null>(null);
  const [revalBusyKey, setRevalBusyKey] = useState<string | null>(null);

  const [subjectKey, setSubjectKey] = useState("");
  const [reason, setReason] = useState("");
  const [proposedTotal, setProposedTotal] = useState("");
  const [proposedGrade, setProposedGrade] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!usn) return;
    api.get(`/students/${usn}/results/effective`).then((r) => {
      setSubjects(
        r.results.map((row: any) => ({ subjectCode: row.subjectCode, subjectName: row.effective.subjectName, semester: row.semester, grade: row.effective.grade, totalMarks: row.effective.totalMarks }))
      );
    });
    api.get(`/students/${usn}/mark-requests`).then(setRequests);
  }

  useEffect(load, [usn]);

  const revalRequests = (requests ?? []).filter((r) => r.requestType === "REVALUATION");
  const correctionRequests = (requests ?? []).filter((r) => r.requestType === "CORRECTION");

  async function toggleReval(subject: SubjectOption) {
    const key = `${subject.subjectCode}-${subject.semester}`;
    const existing = revalRequests.find((r) => r.subjectCode === subject.subjectCode && r.semester === subject.semester);
    setRevalBusyKey(key);
    try {
      if (existing) {
        await api.delete(`/mark-requests/${existing.id}`);
      } else {
        await api.post("/mark-requests", {
          subjectCode: subject.subjectCode,
          subjectName: subject.subjectName ?? undefined,
          semester: subject.semester,
          requestType: "REVALUATION",
        });
      }
      load();
    } catch (err) {
      toast.error("Couldn't update", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setRevalBusyKey(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const subject = subjects.find((s) => `${s.subjectCode}-${s.semester}` === subjectKey);
    if (!subject) return;
    if (!proof) {
      toast.error("Proof required", "Attach a grade card, answer script photo, or similar proof.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("subjectCode", subject.subjectCode);
      if (subject.subjectName) form.append("subjectName", subject.subjectName);
      form.append("semester", String(subject.semester));
      form.append("requestType", "CORRECTION");
      form.append("reason", reason);
      form.append("proposedTotal", proposedTotal);
      form.append("proposedGrade", proposedGrade);
      form.append("proof", proof);
      await api.upload("/mark-requests", form);
      toast.success("Correction request submitted", "Your proctor will review your proof and decide.");
      setSubjectKey("");
      setReason("");
      setProposedTotal("");
      setProposedGrade("");
      setProof(null);
      load();
    } catch (err) {
      toast.error("Couldn't submit request", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Re-Eval &amp; Mark Corrections</h1>
        <p className="mt-1 text-sm text-slate-500">Flag which subjects you've applied for official revaluation on, or report a mark you believe was entered wrong.</p>
      </div>

      <Card>
        <CardHeader title="Revaluation Status" subtitle="Mark which subjects you've applied for revaluation on with the college — this is just a status flag your proctor can see; the outcome comes through the official process." icon={FileSpreadsheet} />
        {subjects.length === 0 ? (
          <EmptyState message="No results yet." icon={FileSpreadsheet} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {subjects.map((s) => {
              const key = `${s.subjectCode}-${s.semester}`;
              const applied = revalRequests.some((r) => r.subjectCode === s.subjectCode && r.semester === s.semester);
              return (
                <li key={key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{s.subjectCode}</span>
                    <span className="ml-1.5 text-xs text-slate-400">{s.subjectName ?? "Subject"} (Sem {s.semester}) — {s.grade ?? "N/A"}</span>
                  </div>
                  <Button
                    size="sm"
                    variant={applied ? "secondary" : "ghost"}
                    disabled={revalBusyKey === key}
                    onClick={() => toggleReval(s)}
                  >
                    {applied ? "Applied for revaluation ✓" : "Mark as applied"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Report a Mark Correction" subtitle="If you believe a mark was entered wrong (not a revaluation), submit proof and your proctor will review it." icon={SendHorizontal} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <Label>Subject</Label>
            <Select required value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
              <option value="">Select a subject...</option>
              {subjects.map((s) => (
                <option key={`${s.subjectCode}-${s.semester}`} value={`${s.subjectCode}-${s.semester}`}>
                  {s.subjectCode} — {s.subjectName ?? "Subject"} (Sem {s.semester}) — {s.grade ?? "N/A"}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label>Reason</Label>
            <Textarea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain why you believe this mark is wrong..." />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>What the total should be</Label>
              <Input required type="number" min={0} max={300} value={proposedTotal} onChange={(e) => setProposedTotal(e.target.value)} />
            </div>
            <div>
              <Label>What the grade should be</Label>
              <Input required value={proposedGrade} onChange={(e) => setProposedGrade(e.target.value)} placeholder="e.g. A+" />
            </div>
          </div>

          <div>
            <Label>Proof (grade card, answer script photo, etc.) — required</Label>
            <FileDropzone file={proof} onChange={setProof} hint="Image or PDF" />
          </div>

          <Button type="submit" disabled={busy} icon={SendHorizontal}>
            {busy ? "Submitting..." : "Submit Correction Request"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="My Correction Requests" icon={FileSpreadsheet} />
        {requests === null ? (
          <SkeletonRows rows={3} />
        ) : correctionRequests.length === 0 ? (
          <EmptyState message="No correction requests submitted yet." icon={FileSpreadsheet} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {correctionRequests.map((r) => (
              <li key={r.id} className="px-5 py-3.5">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {r.subjectCode} — {r.subjectName ?? "Subject"} (Sem {r.semester})
                  </span>
                  <Badge
                    tone={r.status === "APPROVED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}
                    icon={r.status === "APPROVED" ? CheckCircle2 : r.status === "REJECTED" ? XCircle : Clock}
                  >
                    {r.status === "APPROVED" ? "Approved" : r.status === "REJECTED" ? "Rejected" : "Pending review"}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">{r.reason}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Proposed: {r.proposedTotal ?? "-"} ({r.proposedGrade ?? "-"}) · Submitted {new Date(r.submittedAt).toLocaleDateString()}
                </div>
                {r.remarks && <div className="mt-1 text-xs text-slate-600">Proctor's note: {r.remarks}</div>}
                {r.proofFile && (
                  <a href={`/api${r.proofFile}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline">
                    View proof
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
