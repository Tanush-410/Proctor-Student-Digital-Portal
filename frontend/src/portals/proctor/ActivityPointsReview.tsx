import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, CheckCircle2, Paperclip, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Density,
  DensityToggle,
  DENSITY_PAD,
  EmptyState,
  Input,
  SkeletonRows,
  SortableTh,
  StickyScrollTable,
  useSort,
} from "../../components/ui";

interface MatrixRow {
  usn: string;
  name: string;
  section: string | null;
  bySemester: Record<string, number>;
  total: number;
}

const SEMESTERS = [1, 2, 3, 4];

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
  const [matrix, setMatrix] = useState<MatrixRow[] | null>(null);
  const [density, setDensity] = useState<Density>("comfortable");
  const { sorted: sortedMatrix, sortKey, dir, toggle } = useSort<MatrixRow>(matrix ?? [], (row, key) => {
    if (key === "name") return row.name;
    if (key === "total") return row.total;
    return row.bySemester[key] ?? -1;
  });

  function load() {
    api.get("/activity-points/claims?status=pending").then(setClaims);
    api.get("/proctor/activity-points/matrix").then((d) => setMatrix(d.rows));
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

      <Card>
        <CardHeader
          title="By Student, By Semester"
          subtitle="Approved points claimed each semester, for your proctees. Click a column to sort."
          icon={Award}
          action={matrix && matrix.length > 0 ? <DensityToggle density={density} onChange={setDensity} /> : undefined}
        />
        {!matrix ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Loading...</div>
        ) : matrix.length === 0 ? (
          <EmptyState message="No proctees assigned yet." icon={Award} />
        ) : (
          <StickyScrollTable>
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 shadow-[0_1px_0_0_theme(colors.slate.200)]">
                <tr>
                  <SortableTh sortKey="name" activeKey={sortKey} dir={dir} onSort={toggle} className="whitespace-nowrap">
                    Student
                  </SortableTh>
                  {SEMESTERS.map((s) => (
                    <SortableTh key={s} sortKey={String(s)} activeKey={sortKey} dir={dir} onSort={toggle} align="right" className="whitespace-nowrap">
                      Sem {s}
                    </SortableTh>
                  ))}
                  <SortableTh sortKey="total" activeKey={sortKey} dir={dir} onSort={toggle} align="right" className="whitespace-nowrap">
                    Total
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedMatrix.map((row) => (
                  <tr key={row.usn} className="border-t border-slate-100">
                    <td className={`whitespace-nowrap px-5 ${DENSITY_PAD[density]}`}>
                      <Link to={`/proctor/students/${row.usn}`} className="font-medium text-slate-800 hover:underline">
                        {row.name}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-400">
                        {row.usn} {row.section && `· Sec ${row.section}`}
                      </div>
                    </td>
                    {SEMESTERS.map((s) => (
                      <td key={s} className={`px-3 ${DENSITY_PAD[density]} text-right text-slate-600`}>
                        {row.bySemester[String(s)] ?? "-"}
                      </td>
                    ))}
                    <td className={`px-5 ${DENSITY_PAD[density]} text-right`}>
                      <Badge tone={row.total > 0 ? "blue" : "slate"}>{row.total}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StickyScrollTable>
        )}
      </Card>
    </div>
  );
}
