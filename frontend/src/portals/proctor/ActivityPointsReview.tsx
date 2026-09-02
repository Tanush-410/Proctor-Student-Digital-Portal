import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, Paperclip, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, SkeletonRows } from "../../components/ui";

interface Claim {
  claimId: number;
  usn: string;
  description: string;
  requestedPoints: number;
  grantedPoints: number | null;
  status: string;
  remarks: string | null;
  proofFile: string | null;
  submittedAt: string;
  student: { name: string; usn: string; section: string | null };
}

function ReviewRow({ claim, onDone }: { claim: Claim; onDone: () => void }) {
  const toast = useToast();
  const [grantedPoints, setGrantedPoints] = useState(String(claim.requestedPoints));
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState<"APPROVED" | "REJECTED" | null>(null);

  async function review(decision: "APPROVED" | "REJECTED") {
    setBusy(decision);
    try {
      await api.patch(`/activity-points/claims/${claim.claimId}/review`, {
        decision,
        grantedPoints: decision === "APPROVED" ? parseInt(grantedPoints, 10) : undefined,
        remarks: remarks || undefined,
      });
      toast.success(decision === "APPROVED" ? "Claim approved" : "Claim rejected", `${claim.student.name}'s claim was updated.`);
      onDone();
    } catch (err) {
      toast.error("Review failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="mb-2.5 flex items-start justify-between gap-3">
        <Link to={`/proctor/students/${claim.usn}`} className="flex items-center gap-2.5">
          <Avatar name={claim.student.name} size="sm" />
          <div>
            <div className="text-sm font-semibold text-slate-800 hover:text-brand-700">{claim.student.name}</div>
            <div className="font-mono text-[11px] text-slate-400">
              {claim.usn} · {new Date(claim.submittedAt).toLocaleDateString()}
            </div>
          </div>
        </Link>
        <Badge tone="amber">requested {claim.requestedPoints}</Badge>
      </div>
      <p className="mb-2.5 text-sm text-slate-600">{claim.description}</p>
      {claim.proofFile && (
        <a
          href={`/api${claim.proofFile}`}
          target="_blank"
          rel="noreferrer"
          className="mb-2.5 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
        >
          <Paperclip className="h-3 w-3" />
          View proof file
        </a>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-28">
          <label className="mb-1 block text-xs text-slate-500">Granted points</label>
          <Input type="number" min={0} max={claim.requestedPoints} value={grantedPoints} onChange={(e) => setGrantedPoints(e.target.value)} />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-slate-500">Remarks</label>
          <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
        </div>
        <Button icon={CheckCircle2} onClick={() => review("APPROVED")} disabled={busy !== null}>
          {busy === "APPROVED" ? "..." : "Approve"}
        </Button>
        <Button variant="danger" icon={XCircle} onClick={() => review("REJECTED")} disabled={busy !== null}>
          {busy === "REJECTED" ? "..." : "Reject"}
        </Button>
      </div>
    </li>
  );
}

export default function ActivityPointsReview() {
  const [claims, setClaims] = useState<Claim[] | null>(null);

  function load() {
    api.get("/activity-points/claims?status=pending").then(setClaims);
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Review Activity Point Claims</h1>
        <p className="mt-1 text-sm text-slate-500">Approve with a granted total (≤ requested) or reject with a remark.</p>
      </div>

      <Card>
        <CardHeader title={claims === null ? "Loading..." : `${claims.length} pending`} icon={Award} />
        {claims === null ? (
          <SkeletonRows rows={4} />
        ) : claims.length === 0 ? (
          <EmptyState message="No claims waiting on your review." icon={CheckCircle2} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {claims.map((c) => (
              <ReviewRow key={c.claimId} claim={c} onDone={load} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
