import { FormEvent, useState } from "react";
import { AlertTriangle, Users, UserPlus } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Button, Badge, Card, CardHeader, Label, Select } from "../../components/ui";

const CLUSTERS = ["A", "B", "C", "D", "E"] as const;

interface Summary {
  batchId?: number;
  created?: number;
  updated?: number;
  exceptions: number;
  errors: { row: number; message: string }[];
}

function UploadForm({
  title,
  subtitle,
  columns,
  endpoint,
  icon,
  showCluster,
}: {
  title: string;
  subtitle: string;
  columns: string;
  endpoint: string;
  icon: typeof Users;
  showCluster?: boolean;
}) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [cluster, setCluster] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setSummary(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (showCluster && cluster) form.append("cluster", cluster);
      const res = await api.upload(endpoint, form);
      setSummary(res);
      const total = (res.created ?? 0) + (res.updated ?? 0);
      toast.success(`${title} merged`, `${total} row(s) applied${res.exceptions ? `, ${res.exceptions} routed to exceptions` : ""}.`);
      setFile(null);
    } catch (err) {
      toast.error("Upload failed", err instanceof ApiError ? err.message : "Please check the file and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <p className="text-xs text-slate-500">
          Expected columns: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{columns}</code>
        </p>
        {showCluster && (
          <div className="max-w-xs">
            <Label>Cluster this file belongs to</Label>
            <Select value={cluster} onChange={(e) => setCluster(e.target.value)}>
              <option value="">Auto-detect from each proctor's existing tag</option>
              {CLUSTERS.map((c) => (
                <option key={c} value={c}>
                  Cluster {c}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-slate-500">
              Used to tell apart a short code/name reused across clusters, and to tag any proctor in this file who isn't assigned to a cluster yet.
            </p>
          </div>
        )}
        <FileDropzone file={file} onChange={setFile} accept=".csv,.xlsx,.xls" hint="CSV, XLSX, or XLS — every sheet/tab in the file is read" />
        <Button type="submit" disabled={!file || busy}>
          {busy ? "Uploading & merging..." : "Upload & Merge"}
        </Button>
        {summary && (
          <div className="animate-in-fast rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {summary.created !== undefined && <Badge tone="green">{summary.created} created</Badge>}
              {summary.updated !== undefined && <Badge tone="blue">{summary.updated} updated</Badge>}
              <Badge tone={summary.exceptions > 0 ? "amber" : "green"}>{summary.exceptions} exceptions</Badge>
              {summary.errors.length > 0 && <Badge tone="red">{summary.errors.length} row errors</Badge>}
            </div>
            {summary.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-red-600">
                {summary.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {summary.exceptions > 0 && <p className="mt-2 text-xs text-slate-500">Unmatched rows were routed to the Exceptions tab for manual resolution.</p>}
          </div>
        )}
      </form>
    </Card>
  );
}

export default function UploadData() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Upload & Merge Student Data</h1>
        <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          The class-list and admission-data sheets are independently maintained and share only an e-mail address as a
          join key. Anything that fails to join is queued for manual resolution rather than dropped.
        </p>
      </div>

      <UploadForm
        title="Class List"
        subtitle="Creates/updates students and allocates them to a proctor by short code."
        columns="usn, name, email, section, proctor_short_code"
        endpoint="/admin/upload/class-list"
        icon={Users}
        showCluster
      />

      <UploadForm
        title="Admission Data"
        subtitle="Merges family, quota, and local-residence details onto existing class-list students by e-mail."
        columns="email, admission_year, quota, father_name, father_phone, mother_name, mother_phone, local_address, local_guardian_name, local_guardian_phone"
        endpoint="/admin/upload/admission-data"
        icon={UserPlus}
      />
    </div>
  );
}
