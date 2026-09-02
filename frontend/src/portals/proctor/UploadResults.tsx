import { FormEvent, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Badge, Button, Card, CardHeader, Label, Select } from "../../components/ui";

const SOURCE_TYPES = ["MAIN", "TAL", "REVAL", "CHALLENGE_REVAL", "SUPPLEMENTARY"];

interface Summary {
  batchId: number;
  created: number;
  exceptions: number;
  errors: { row: number; message: string }[];
}

export default function UploadResults() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [sourceType, setSourceType] = useState("MAIN");
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
      form.append("source_type", sourceType);
      const res = await api.upload("/results/upload", form);
      setSummary(res);
      toast.success("Results uploaded", `${res.created} record(s) created${res.exceptions ? `, ${res.exceptions} exceptions` : ""}.`);
      setFile(null);
    } catch (err) {
      toast.error("Upload failed", err instanceof ApiError ? err.message : "Please check the file and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Upload Official Result Sheet</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every row is stored as a new, timestamped record — nothing overwrites a prior result. Rows for students who
          aren't your proctees are routed to the exception queue.
        </p>
      </div>

      <Card>
        <CardHeader title="New Result Sheet" icon={FileSpreadsheet} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <Label>Source Type</Label>
            <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <p className="text-xs text-slate-500">
            Expected columns:{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
              usn, subject_code, subject_name, semester, internal_marks, external_marks, total_marks, credits, grade, status
            </code>
          </p>
          <FileDropzone file={file} onChange={setFile} accept=".csv,.xlsx,.xls" hint="CSV, XLSX, or XLS" />
          <Button type="submit" disabled={!file || busy}>
            {busy ? "Uploading..." : "Upload"}
          </Button>
          {summary && (
            <div className="animate-in-fast rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge tone="green">{summary.created} records created</Badge>
                <Badge tone={summary.exceptions > 0 ? "amber" : "green"}>{summary.exceptions} exceptions</Badge>
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
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
