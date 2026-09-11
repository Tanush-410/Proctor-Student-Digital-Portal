import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, Award, Building2, CalendarClock, Download, Eye, FileSearch, GraduationCap, History, Mail, Phone, Trash2, Users, UserRound, XCircle } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Breadcrumb, Card, CardHeader, EmptyState, IconButton, MobileListRow, PageSpinner, ResponsiveTable, StatTile } from "../../components/ui";
import { ConfirmModal } from "../../components/Modal";

interface Faculty {
  facultyId: number;
  staffId: string;
  name: string;
  shortCode: string;
  cabinNo: string | null;
  telecomNo: string | null;
  phone: string | null;
  email: string;
  role: "ADMIN" | "PROCTOR";
}
interface Proctee {
  usn: string;
  name: string;
  section: string | null;
  currentSemester: number;
}
interface Claim {
  claimId: number;
  usn: string;
  status: string;
  requestedPoints: number;
  grantedPoints: number | null;
  reviewedAt: string | null;
  student: { name: string; usn: string };
}
interface Ptm {
  ptmId: number;
  ptmDate: string;
  ptmTime: string;
  notes: string | null;
  usn: string | null;
  student: { name: string; usn: string; section: string | null } | null;
}
interface ImportBatch {
  batchId: number;
  sourceType: string;
  uploadedAt: string;
  rowCount: number;
  errorCount: number;
  sourceFile: string | null;
}

interface Detail {
  faculty: Faculty;
  proctees: Proctee[];
  ptmRecords: Ptm[];
  claimsReviewed: Claim[];
  importBatches: ImportBatch[];
}

interface AtRisk {
  usn: string;
  name: string;
  section: string | null;
  cgpa: number | null;
  backlogs: number;
}
interface Analytics {
  proctee_count: number;
  avgCgpa: number | null;
  backlogCount: number;
  pendingClaims: number;
  atRisk: AtRisk[];
}

function InfoField({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="text-xs uppercase tracking-wide text-slate-400">{label}</span>
      <span className="text-slate-700">{value}</span>
    </div>
  );
}

export default function FacultyDetail({ base }: { base: string }) {
  const { id } = useParams<{ id: string }>();
  const { auth } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<Detail | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Ptm | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setData(null);
    setAnalytics(null);
    setError(null);
    api
      .get(`/proctors/${id}`)
      .then(setData)
      .catch((e) => setError(e.message ?? "Failed to load faculty"));
  }, [id]);

  useEffect(() => {
    if (!id || !auth) return;
    const canSeeAnalytics = auth.role === "ADMIN" || (auth.role === "PROCTOR" && "facultyId" in auth.profile && auth.profile.facultyId === parseInt(id, 10));
    if (!canSeeAnalytics) return;
    api.get(`/proctors/${id}/analytics`).then(setAnalytics);
  }, [id, auth]);

  async function downloadPtmPdf(ptmId: number) {
    setDownloadingId(ptmId);
    try {
      const blob = await api.downloadPdf(`/ptm/${ptmId}/report`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't generate PDF", "Please try again.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function confirmDeletePtm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/ptm/${deleteTarget.ptmId}`);
      toast.success("PTM record deleted");
      setDeleteTarget(null);
      setData((prev) => (prev ? { ...prev, ptmRecords: prev.ptmRecords.filter((p) => p.ptmId !== deleteTarget.ptmId) } : prev));
    } catch (err) {
      toast.error("Couldn't delete", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (error) return <EmptyState message={error} />;
  if (!data) return <PageSpinner />;

  const { faculty, proctees, ptmRecords, claimsReviewed, importBatches } = data;
  const canDeletePtm = auth?.role === "ADMIN" || (auth?.role === "PROCTOR" && "facultyId" in auth.profile && auth.profile.facultyId === faculty.facultyId);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[base === "/admin" ? { label: "Faculty", to: `${base}/faculty` } : { label: "Directory", to: `${base}/directory` }, { label: faculty.name }]} />
      <Card>
        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={faculty.name} size="lg" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900">{faculty.name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                <span className="font-mono text-xs text-slate-400">{faculty.shortCode}</span>
                <span>·</span>
                <span>Staff ID {faculty.staffId}</span>
              </p>
            </div>
          </div>
          <Badge tone={faculty.role === "ADMIN" ? "blue" : "slate"}>{faculty.role}</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <InfoField icon={Mail} label="Email" value={faculty.email} />
          <InfoField icon={Phone} label="Phone" value={faculty.phone ?? "-"} />
          <InfoField icon={Building2} label="Cabin" value={faculty.cabinNo ?? "-"} />
          <InfoField icon={Phone} label="Telecom" value={faculty.telecomNo ?? "-"} />
        </div>
      </Card>

      {faculty.role === "PROCTOR" && analytics && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile index={0} label="Proctees" value={analytics.proctee_count} icon={Users} />
            <StatTile index={1} label="Avg. CGPA" value={analytics.avgCgpa ?? "N/A"} tone="blue" icon={GraduationCap} />
            <StatTile index={2} label="Backlogs" value={analytics.backlogCount} tone={analytics.backlogCount > 0 ? "red" : "green"} icon={XCircle} />
            <StatTile index={3} label="Pending Claims" value={analytics.pendingClaims} tone={analytics.pendingClaims > 0 ? "amber" : "green"} icon={Award} />
          </div>

          {analytics.atRisk.length > 0 && (
            <Card>
              <CardHeader title="At-Risk Students" subtitle="Backlogs, or a CGPA below 6." icon={AlertTriangle} />
              <ul className="divide-y divide-slate-100">
                {analytics.atRisk.map((s) => (
                  <li key={s.usn}>
                    <Link to={`${base}/students/${s.usn}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={s.name} size="sm" />
                        <div>
                          <div className="font-medium text-slate-800">{s.name}</div>
                          <div className="font-mono text-[11px] text-slate-400">{s.usn}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone="blue">CGPA {s.cgpa ?? "N/A"}</Badge>
                        {s.backlogs > 0 && (
                          <Badge tone="red">
                            {s.backlogs} backlog{s.backlogs > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {faculty.role === "PROCTOR" && (
        <Card>
          <CardHeader title={`Proctees (${proctees.length})`} icon={Users} />
          {proctees.length === 0 ? (
            <EmptyState message="No proctees allocated yet." hint="The Admin allocates proctees during class-list upload." icon={Users} />
          ) : (
            <ResponsiveTable
              table={
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
                    {proctees.map((s) => (
                      <tr key={s.usn} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-2.5">
                          <Link to={`${base}/students/${s.usn}`} className="group flex items-center gap-2.5">
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
                          <Link to={`${base}/students/${s.usn}`} className="text-xs font-medium text-brand-600 hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
              cards={proctees.map((s) => (
                <MobileListRow
                  key={s.usn}
                  to={`${base}/students/${s.usn}`}
                  leading={<Avatar name={s.name} size="sm" />}
                  title={s.name}
                  meta={`${s.usn} · Sem ${s.currentSemester}`}
                  trailing={<Badge>{s.section ?? "-"}</Badge>}
                />
              ))}
            />
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent PTM Records" icon={CalendarClock} />
          {ptmRecords.length === 0 ? (
            <EmptyState message="No PTM records yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {ptmRecords.map((p) => (
                <li key={p.ptmId} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate">{p.student ? `${p.student.name} (${p.student.usn})` : "General meeting"}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {p.ptmDate} at {p.ptmTime}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a href={`/ptm/${p.ptmId}`} target="_blank" rel="noreferrer">
                      <IconButton icon={Eye} label="View PTM record" size="sm" />
                    </a>
                    <IconButton icon={Download} label="Download PDF" size="sm" onClick={() => downloadPtmPdf(p.ptmId)} disabled={downloadingId === p.ptmId} />
                    {canDeletePtm && <IconButton icon={Trash2} label="Delete PTM record" size="sm" tone="danger" onClick={() => setDeleteTarget(p)} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recently Reviewed Claims" icon={Award} />
          {claimsReviewed.length === 0 ? (
            <EmptyState message="No claims reviewed yet." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {claimsReviewed.map((c) => (
                <li key={c.claimId} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <div className="font-medium text-slate-800">{c.student.name}</div>
                    <div className="font-mono text-[11px] text-slate-400">{c.usn}</div>
                  </div>
                  <Badge tone={c.status === "APPROVED" ? "green" : "red"}>
                    {c.status === "APPROVED" ? `+${c.grantedPoints}` : c.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent Uploads" icon={History} />
        {importBatches.length === 0 ? (
          <EmptyState message="No uploads yet." hint="Uploads from Scan Import or the class-list/results flows show up here." icon={GraduationCap} />
        ) : (
          <ResponsiveTable
            table={
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Source</th>
                    <th className="px-5 py-2.5 font-medium">When</th>
                    <th className="px-5 py-2.5 font-medium">Rows</th>
                    <th className="px-5 py-2.5 font-medium">Errors</th>
                    <th className="px-5 py-2.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {importBatches.map((b) => (
                    <tr key={b.batchId} className="border-t border-slate-100">
                      <td className="px-5 py-2.5 font-medium text-slate-800">{b.sourceType}</td>
                      <td className="px-5 py-2.5 text-slate-500">{new Date(b.uploadedAt).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-slate-600">{b.rowCount}</td>
                      <td className="px-5 py-2.5">
                        <Badge tone={b.errorCount > 0 ? "amber" : "green"}>{b.errorCount}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {b.sourceFile && (
                          <a
                            href={`/api/admin/import-batches/${b.batchId}/source-file`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                            Source
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            cards={importBatches.map((b) => (
              <li key={b.batchId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{b.sourceType}</span>
                  <Badge tone={b.errorCount > 0 ? "amber" : "green"}>{b.errorCount} errors</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {new Date(b.uploadedAt).toLocaleString()} · {b.rowCount} rows
                  </span>
                  {b.sourceFile && (
                    <a href={`/api/admin/import-batches/${b.batchId}/source-file`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-600">
                      <FileSearch className="h-3.5 w-3.5" />
                      Source
                    </a>
                  )}
                </div>
              </li>
            ))}
          />
        )}
      </Card>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete PTM record?"
        description={`This permanently removes the ${deleteTarget?.ptmDate ?? ""} record${
          deleteTarget?.student ? ` for ${deleteTarget.student.name}` : ""
        }, including its notes. This can't be undone.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deleting}
        onConfirm={confirmDeletePtm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
