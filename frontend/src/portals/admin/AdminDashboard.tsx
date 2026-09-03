import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, GraduationCap, History, Users } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api } from "../../api/client";
import { Badge, Card, CardHeader, EmptyState, SkeletonRows, StatTile } from "../../components/ui";
import { DashboardHero } from "../../components/DashboardHero";

interface Batch {
  batchId: number;
  sourceType: string;
  uploadedAt: string;
  rowCount: number;
  errorCount: number;
  uploader: { name: string; shortCode: string };
}

export default function AdminDashboard() {
  const { auth } = useAuth();
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [facultyCount, setFacultyCount] = useState<number | null>(null);
  const [exceptionCount, setExceptionCount] = useState<number | null>(null);
  const [batches, setBatches] = useState<Batch[] | null>(null);

  useEffect(() => {
    api.get("/students/count").then((r) => setStudentCount(r.count));
    api.get("/proctors/count").then((r) => setFacultyCount(r.count));
    api.get("/admin/import-exceptions?resolved=false").then((r) => setExceptionCount(r.length));
    api.get("/admin/import-batches").then(setBatches);
  }, []);

  const firstName = auth?.profile.name.replace(/^(Dr\.|Prof\.)\s*/, "").split(" ")[0];

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="BMS College of Engineering — HOD Portal"
        title={`Welcome back, ${firstName}`}
        subtitle="Department-wide overview across ingestion, results, and proctee allocation."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile label="Students" value={studentCount ?? 0} tone="blue" icon={GraduationCap} loading={studentCount === null} />
        <StatTile label="Faculty" value={facultyCount ?? 0} icon={Users} loading={facultyCount === null} />
        <StatTile
          label="Unresolved Exceptions"
          value={exceptionCount ?? 0}
          tone={exceptionCount ? "red" : "green"}
          icon={AlertTriangle}
          loading={exceptionCount === null}
        />
      </div>

      <Card>
        <CardHeader title="Recent Import Batches" subtitle="Every ingestion run is logged for traceability, whether it fully succeeded or not." icon={History} />
        {batches === null ? (
          <SkeletonRows rows={4} />
        ) : batches.length === 0 ? (
          <EmptyState message="No imports yet — start on the Upload tab." icon={History} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Source</th>
                  <th className="px-5 py-2.5 font-medium">Uploaded By</th>
                  <th className="px-5 py-2.5 font-medium">When</th>
                  <th className="px-5 py-2.5 font-medium">Rows</th>
                  <th className="px-5 py-2.5 font-medium">Errors</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batchId} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-2.5 font-medium text-slate-800">{b.sourceType}</td>
                    <td className="px-5 py-2.5 text-slate-600">
                      {b.uploader.name} <span className="text-slate-400">({b.uploader.shortCode})</span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-500">{new Date(b.uploadedAt).toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-slate-600">{b.rowCount}</td>
                    <td className="px-5 py-2.5">
                      {b.errorCount > 0 ? (
                        <Link to="/admin/exceptions">
                          <Badge tone="red">{b.errorCount}</Badge>
                        </Link>
                      ) : (
                        <Badge tone="green">0</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
