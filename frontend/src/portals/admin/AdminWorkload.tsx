import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Scale, UserX, Users } from "lucide-react";
import { api } from "../../api/client";
import { Avatar, Badge, Card, CardHeader, EmptyState, PageSpinner, StatTile } from "../../components/ui";
import { BarChart } from "../../components/charts";

interface ProctorLoad {
  facultyId: number;
  name: string;
  shortCode: string;
  procteeCount: number;
}

interface Workload {
  proctors: ProctorLoad[];
  unassignedCount: number;
  avgLoad: number;
  minLoad: number;
  maxLoad: number;
}

export default function AdminWorkload() {
  const [data, setData] = useState<Workload | null>(null);

  useEffect(() => {
    api.get("/admin/workload").then(setData);
  }, []);

  if (!data) return <PageSpinner />;

  const imbalanced = data.maxLoad - data.minLoad >= 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Faculty Workload</h1>
        <p className="mt-1 text-sm text-slate-500">Proctee-count balance across proctors — reassign from a student's detail page if it's lopsided.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="Proctors" value={data.proctors.length} icon={Users} />
        <StatTile label="Average Load" value={data.avgLoad} tone="blue" icon={Scale} />
        <StatTile label="Spread (min–max)" value={`${data.minLoad}–${data.maxLoad}`} tone={imbalanced ? "amber" : "green"} icon={Scale} />
        <StatTile label="Unassigned Students" value={data.unassignedCount} tone={data.unassignedCount > 0 ? "red" : "green"} icon={UserX} />
      </div>

      <Card>
        <CardHeader title="Proctee Count by Proctor" icon={Users} />
        {data.proctors.length === 0 ? (
          <EmptyState message="No proctors yet." icon={Users} />
        ) : (
          <div className="overflow-x-auto px-5 py-5">
            <BarChart
              bars={data.proctors.map((p) => ({ label: p.shortCode, value: p.procteeCount, color: p.procteeCount === 0 ? "#cbd5e1" : "#00519c" }))}
              height={200}
            />
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="All Proctors" icon={Scale} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-2.5 font-medium">Proctor</th>
                <th className="px-5 py-2.5 font-medium">Proctees</th>
                <th className="px-5 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.proctors.map((p) => (
                <tr key={p.facultyId} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                  <td className="px-5 py-2.5">
                    <Link to={`/admin/faculty/${p.facultyId}`} className="group flex items-center gap-2.5">
                      <Avatar name={p.name} size="sm" />
                      <span className="font-medium text-slate-800 group-hover:text-brand-700">{p.name}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">
                    <Badge tone={p.procteeCount > data.avgLoad + 5 ? "amber" : p.procteeCount === 0 ? "slate" : "blue"}>{p.procteeCount}</Badge>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Link to={`/admin/faculty/${p.facultyId}`} className="text-xs font-medium text-brand-600 hover:underline">
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
