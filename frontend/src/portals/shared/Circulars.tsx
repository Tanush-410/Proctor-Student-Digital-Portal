import { FormEvent, useEffect, useState } from "react";
import { CheckCheck, Download, FileText, Megaphone, Paperclip, SendHorizontal, Upload } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, PageSpinner, SkeletonRows } from "../../components/ui";
import { FileDropzone } from "../../components/FileDropzone";
import { RichTextDocument, RichTextEditor, isEmptyHtml } from "../../components/RichTextEditor";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface FacultyHit {
  facultyId: number;
  name: string;
  shortCode: string;
  role: string;
}

interface CircularListRow {
  id: number;
  title: string;
  hasBody: boolean;
  fileName: string | null;
  createdAt: string;
  sender: { name: string; shortCode: string };
  recipientCount?: number;
  readCount?: number;
  read?: boolean;
}

interface CircularDetail {
  id: number;
  title: string;
  body: string | null;
  fileUrl: string | null;
  fileName: string | null;
  createdAt: string;
  sender: { name: string; shortCode: string };
  recipients: { faculty: { facultyId: number; name: string; shortCode: string }; read: boolean; readAt: string | null }[];
}

function Composer({ onSent }: { onSent: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"write" | "upload">("write");
  const [body, setBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 250);
  const [candidates, setCandidates] = useState<FacultyHit[]>([]);
  const [selected, setSelected] = useState<Map<number, FacultyHit>>(new Map());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/proctors?q=${encodeURIComponent(debouncedQ)}`).then(setCandidates);
  }, [debouncedQ]);

  function toggle(f: FacultyHit) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(f.facultyId)) next.delete(f.facultyId);
      else next.set(f.facultyId, f);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (selected.size === 0) {
      toast.error("Pick at least one recipient");
      return;
    }
    if (mode === "write" && isEmptyHtml(body)) {
      toast.error("Write something first", "Or switch to Upload and attach a file.");
      return;
    }
    if (mode === "upload" && !file) {
      toast.error("Attach a file first");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title);
      form.append("recipientIds", [...selected.keys()].join(","));
      if (mode === "write") form.append("body", body);
      else if (file) form.append("file", file);
      await api.upload("/circulars", form);
      toast.success("Circular sent", `Delivered to ${selected.size} recipient${selected.size === 1 ? "" : "s"}.`);
      setTitle("");
      setBody("");
      setEditorKey((k) => k + 1);
      setFile(null);
      setSelected(new Map());
      onSent();
    } catch (err) {
      toast.error("Couldn't send circular", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="New Circular" icon={Megaphone} />
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <div>
          <Label>Title</Label>
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Semester End Exam Schedule" />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label>Content</Label>
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              <button type="button" onClick={() => setMode("write")} className={`rounded-md px-2.5 py-1 font-medium transition-colors ${mode === "write" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                Write
              </button>
              <button type="button" onClick={() => setMode("upload")} className={`rounded-md px-2.5 py-1 font-medium transition-colors ${mode === "upload" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
                Upload PDF/Word
              </button>
            </div>
          </div>
          {mode === "write" ? (
            <RichTextEditor key={editorKey} content={body} onChange={setBody} placeholder="Write the circular..." />
          ) : (
            <FileDropzone file={file} onChange={setFile} accept=".pdf,.doc,.docx" hint="PDF or Word document" />
          )}
        </div>

        <div>
          <Label>Recipients ({selected.size} selected)</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search faculty by name..." className="mb-2" />
          {selected.size > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...selected.values()].map((f) => (
                <button key={f.facultyId} type="button" onClick={() => toggle(f)}>
                  <Badge tone="blue">{f.name} ×</Badge>
                </button>
              ))}
            </div>
          )}
          <ul className="max-h-48 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {candidates.map((f) => (
              <li key={f.facultyId}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={selected.has(f.facultyId)} onChange={() => toggle(f)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  <span className="flex-1 text-slate-800">{f.name}</span>
                  <span className="text-xs text-slate-400">
                    {f.shortCode} · {f.role}
                  </span>
                </label>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-400">No faculty found.</li>}
          </ul>
        </div>

        <Button type="submit" disabled={busy} icon={SendHorizontal}>
          {busy ? "Sending..." : "Send Circular"}
        </Button>
      </form>
    </Card>
  );
}

function CircularDetailView({ id, onClose }: { id: number; onClose: () => void }) {
  const toast = useToast();
  const [detail, setDetail] = useState<CircularDetail | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    api.get(`/circulars/${id}`).then(setDetail);
  }, [id]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.downloadPdf(`/circulars/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't generate PDF", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (!detail) return <PageSpinner />;

  return (
    <Card>
      <CardHeader
        title={detail.title}
        subtitle={`From ${detail.sender.name} (${detail.sender.shortCode}) · ${new Date(detail.createdAt).toLocaleString()}`}
        icon={Megaphone}
        action={
          <div className="flex items-center gap-2">
            {detail.body && (
              <Button size="sm" variant="secondary" icon={Download} onClick={downloadPdf} disabled={downloading}>
                {downloading ? "Preparing..." : "Download PDF"}
              </Button>
            )}
            {detail.fileUrl && (
              <a href={`/api${detail.fileUrl}`} target="_blank" rel="noreferrer">
                <Button size="sm" variant="secondary" icon={Download} type="button">
                  Download File
                </Button>
              </a>
            )}
            <Button size="sm" variant="ghost" onClick={onClose} type="button">
              Close
            </Button>
          </div>
        }
      />
      <div className="px-5 py-4">
        {detail.body ? (
          <RichTextDocument html={detail.body} />
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            <Paperclip className="h-4 w-4 text-slate-400" />
            {detail.fileName ?? "Attached file"}
          </div>
        )}

        {detail.recipients.length > 0 && (
          <div className="mt-5">
            <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Sent to ({detail.recipients.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {detail.recipients.map((r) => (
                <Badge key={r.faculty.facultyId} tone={r.read ? "green" : "slate"} icon={r.read ? CheckCheck : undefined}>
                  {r.faculty.name}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Circulars() {
  const { auth } = useAuth();
  const isAdmin = auth?.role === "ADMIN";
  const [rows, setRows] = useState<CircularListRow[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);

  function load() {
    api.get("/circulars").then(setRows);
  }

  useEffect(load, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Circulars</h1>
        <p className="mt-1 text-sm text-slate-500">{isAdmin ? "Send a department notice to selected proctors." : "Notices sent to you by the HOD."}</p>
      </div>

      {activeId !== null ? (
        <CircularDetailView
          id={activeId}
          onClose={() => {
            setActiveId(null);
            load();
          }}
        />
      ) : (
        <>
          {isAdmin && <Composer onSent={load} />}

          <Card>
            <CardHeader title={isAdmin ? "Sent Circulars" : "Received Circulars"} icon={FileText} />
            {rows === null ? (
              <SkeletonRows rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState message={isAdmin ? "No circulars sent yet." : "No circulars yet."} icon={Megaphone} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {rows.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setActiveId(c.id)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.read === false ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>
                        {c.fileName ? <Upload className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {c.read === false && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />}
                          <span className="truncate text-sm font-medium text-slate-800">{c.title}</span>
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-400">
                          {isAdmin ? `${c.recipientCount} recipient${c.recipientCount === 1 ? "" : "s"} · ${c.readCount} read` : `From ${c.sender.name} (${c.sender.shortCode})`} ·{" "}
                          {new Date(c.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      {c.fileName && <Badge tone="slate">{c.fileName.split(".").pop()?.toUpperCase()}</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
