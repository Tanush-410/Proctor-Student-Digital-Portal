import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks } from "lucide-react";
import { api } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Badge, Button, Card, CardHeader, EmptyState, SkeletonRows } from "../../components/ui";

interface Exception {
  id: number;
  rowNumber: number;
  rawData: Record<string, string>;
  reason: string;
  createdAt: string;
  batch: { sourceType: string; uploadedAt: string };
}

export default function ImportExceptions() {
  const toast = useToast();
  const [exceptions, setExceptions] = useState<Exception[] | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  function load() {
    api.get("/admin/import-exceptions?resolved=false").then(setExceptions);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolve(id: number) {
    setResolvingId(id);
    try {
      await api.patch(`/admin/import-exceptions/${id}/resolve`);
      toast.success("Marked resolved");
      load();
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Exception Queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rows that failed to join or allocate during an ingestion run. Nothing here was dropped — fix the source data
          and re-upload, then mark resolved.
        </p>
      </div>

      <Card>
        <CardHeader title={exceptions === null ? "Loading..." : `${exceptions.length} unresolved`} icon={ListChecks} />
        {exceptions === null ? (
          <SkeletonRows rows={4} />
        ) : exceptions.length === 0 ? (
          <EmptyState message="No outstanding exceptions." icon={CheckCircle2} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {exceptions.map((ex) => (
              <li key={ex.id} className="flex items-start justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex items-center gap-2">
                    <Badge tone="amber">{ex.batch.sourceType}</Badge>
                    <span className="text-xs text-slate-400">
                      row {ex.rowNumber || "n/a"} · {new Date(ex.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{ex.reason}</p>
                  <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-500">{JSON.stringify(ex.rawData)}</pre>
                </div>
                <Button variant="secondary" size="sm" onClick={() => resolve(ex.id)} disabled={resolvingId === ex.id}>
                  {resolvingId === ex.id ? "..." : "Mark Resolved"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
