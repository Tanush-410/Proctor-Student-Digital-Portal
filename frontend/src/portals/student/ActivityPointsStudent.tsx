import { FormEvent, useEffect, useState } from "react";
import { Award, CheckCircle2, Clock, SendHorizontal, XCircle } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, SkeletonRows, StatTile, Textarea } from "../../components/ui";

interface Claim {
  claimId: number;
  description: string;
  requestedPoints: number;
  grantedPoints: number | null;
  status: string;
  remarks: string | null;
  submittedAt: string;
}

const STATUS_ICON: Record<string, typeof CheckCircle2> = { APPROVED: CheckCircle2, REJECTED: XCircle, PENDING: Clock };

export default function ActivityPointsStudent() {
  const { auth } = useAuth();
  const toast = useToast();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [total, setTotal] = useState(0);
  const [description, setDescription] = useState("");
  const [requestedPoints, setRequestedPoints] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!usn) return;
    api.get(`/students/${usn}/activity-points`).then((r) => {
      setClaims(r.claims);
      setTotal(r.runningTotal);
    });
  }

  useEffect(load, [usn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append("description", description);
      form.append("requestedPoints", requestedPoints);
      if (proof) form.append("proof", proof);
      await api.upload("/activity-points/claims", form);
      toast.success("Claim submitted", "Your proctor will review it soon.");
      setDescription("");
      setRequestedPoints("");
      setProof(null);
      load();
    } catch (err) {
      toast.error("Couldn't submit claim", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Activity Points</h1>
        <p className="mt-1 text-sm text-slate-500">Submit a claim with proof; your proctor reviews and grants a final point total.</p>
      </div>

      <StatTile label="Approved Total" value={total} tone="amber" icon={Award} />

      <Card>
        <CardHeader title="Submit a New Claim" icon={SendHorizontal} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <Label>Description</Label>
            <Textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Winner, Smart India Hackathon 2026" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Requested Points</Label>
              <Input required type="number" min={1} value={requestedPoints} onChange={(e) => setRequestedPoints(e.target.value)} />
            </div>
            <div>
              <Label>Proof (certificate/screenshot)</Label>
              <FileDropzone file={proof} onChange={setProof} hint="Any file type" />
            </div>
          </div>
          <Button type="submit" disabled={busy} icon={SendHorizontal}>
            {busy ? "Submitting..." : "Submit Claim"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="My Claims" />
        {claims === null ? (
          <SkeletonRows rows={3} />
        ) : claims.length === 0 ? (
          <EmptyState message="No claims submitted yet." icon={Award} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {claims.map((c) => (
              <li key={c.claimId} className="px-5 py-3.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{c.description}</span>
                  <Badge tone={c.status === "APPROVED" ? "green" : c.status === "REJECTED" ? "red" : "amber"} icon={STATUS_ICON[c.status]}>
                    {c.status}
                  </Badge>
                </div>
                <div className="text-xs text-slate-500">
                  Requested {c.requestedPoints}
                  {c.grantedPoints !== null ? ` · Granted ${c.grantedPoints}` : ""} · {new Date(c.submittedAt).toLocaleDateString()}
                </div>
                {c.remarks && <div className="mt-1 text-xs text-slate-500">Remarks: {c.remarks}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
