import { useEffect, useState } from "react";
import { History, ShieldCheck } from "lucide-react";
import { api } from "../../api/client";
import { Badge, Button, Card, CardHeader, EmptyState, Input, SkeletonRows } from "../../components/ui";

interface Entry {
  id: number;
  actorId: number | null;
  actorRole: string;
  actor: { name: string; shortCode: string } | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata: string | null;
  createdAt: string;
}

const ACTION_TONE: Record<string, "green" | "red" | "amber" | "blue" | "slate"> = {
  CREATE: "green",
  UPDATE: "blue",
  DELETE: "red",
  REASSIGN: "amber",
  VIEW: "slate",
  EXPORT: "blue",
  APPROVE: "green",
  REJECT: "red",
  RESOLVE: "green",
  COMMIT: "blue",
  UPLOAD: "blue",
  PROMOTE_COHORT: "amber",
};

export default function AuditLog() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [targetType, setTargetType] = useState("");
  const [targetId, setTargetId] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  function load(reset: boolean) {
    const params = new URLSearchParams();
    if (targetType) params.set("targetType", targetType);
    if (targetId) params.set("targetId", targetId);
    if (!reset && cursor) params.set("cursor", String(cursor));
    api.get(`/admin/audit-log?${params.toString()}`).then((res) => {
      setEntries((prev) => (reset || !prev ? res.entries : [...prev, ...res.entries]));
      setCursor(res.nextCursor);
      setHasMore(res.nextCursor !== null);
      setLoadingMore(false);
    });
  }

  useEffect(() => {
    setEntries(null);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    setEntries(null);
    load(true);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">Who touched which record, and when — the compliance trail for real student data.</p>
      </div>

      <Card>
        <form onSubmit={applyFilter} className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
          <div className="w-40">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Target type</label>
            <Input placeholder="e.g. Student" value={targetType} onChange={(e) => setTargetType(e.target.value)} />
          </div>
          <div className="w-48">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Target id</label>
            <Input placeholder="e.g. a USN" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
          </div>
          <Button type="submit" size="sm">
            Filter
          </Button>
          {(targetType || targetId) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTargetType("");
                setTargetId("");
                setEntries(null);
                setCursor(null);
                load(true);
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {entries === null ? (
          <SkeletonRows rows={8} />
        ) : entries.length === 0 ? (
          <EmptyState message="No matching entries." icon={History} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">When</th>
                    <th className="px-5 py-2.5 font-medium">Actor</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                    <th className="px-5 py-2.5 font-medium">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-slate-100 align-top">
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-slate-700">
                        {e.actor ? `${e.actor.name} (${e.actor.shortCode})` : "System"}
                        <span className="ml-1.5 text-xs text-slate-400">{e.actorRole}</span>
                      </td>
                      <td className="px-5 py-2.5">
                        <Badge tone={ACTION_TONE[e.action] ?? "slate"}>{e.action}</Badge>
                      </td>
                      <td className="px-5 py-2.5 text-slate-600">
                        <span className="font-medium text-slate-700">{e.targetType}</span>{" "}
                        <span className="font-mono text-xs text-slate-400">{e.targetId}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center border-t border-slate-100 py-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    load(false);
                  }}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <ShieldCheck className="h-3.5 w-3.5" />
        Views are logged for individual student/faculty records, not list or search calls.
      </p>
    </div>
  );
}
