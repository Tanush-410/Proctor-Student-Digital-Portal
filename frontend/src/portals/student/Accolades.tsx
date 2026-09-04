import { FormEvent, useEffect, useState } from "react";
import { Award, Paperclip, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { FileDropzone } from "../../components/FileDropzone";
import { Badge, Button, Card, CardHeader, EmptyState, Input, Label, PageSpinner, Select, Textarea } from "../../components/ui";

interface AccoladeItem {
  id: number;
  title: string;
  description: string;
  category: string | null;
  proofFile: string | null;
  createdAt: string;
}

const CATEGORIES = ["Sports", "Technical", "Cultural", "Academic", "Volunteering", "Other"];

const CATEGORY_TONE: Record<string, "blue" | "green" | "amber" | "red" | "slate"> = {
  Sports: "green",
  Technical: "blue",
  Cultural: "amber",
  Academic: "blue",
  Volunteering: "slate",
  Other: "slate",
};

export default function Accolades() {
  const { auth } = useAuth();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const toast = useToast();
  const [items, setItems] = useState<AccoladeItem[] | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    if (!usn) return;
    api.get(`/students/${usn}/accolades`).then(setItems);
  }

  useEffect(load, [usn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usn) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("category", category);
      if (file) form.append("proof", file);
      await api.upload(`/students/${usn}/accolades`, form);
      toast.success("Accolade posted", "Your proctor has been notified.");
      setTitle("");
      setDescription("");
      setCategory(CATEGORIES[0]);
      setFile(null);
      load();
    } catch (err) {
      toast.error("Couldn't post accolade", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!usn) return;
    try {
      await api.delete(`/students/${usn}/accolades/${id}`);
      load();
    } catch (err) {
      toast.error("Couldn't remove", err instanceof ApiError ? err.message : "Please try again.");
    }
  }

  if (items === null) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Accolades</h1>
        <p className="mt-1 text-sm text-slate-500">
          Anything that stood out — a national-level sport, a hackathon win, a publication. Visible to your proctor and the HOD.
        </p>
      </div>

      <Card>
        <CardHeader title="Post a New Accolade" icon={Sparkles} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label htmlFor="accolade-title">Title</Label>
              <Input id="accolade-title" required maxLength={150} placeholder="e.g. National-level swimmer" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="accolade-category">Category</Label>
              <Select id="accolade-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="accolade-description">Description</Label>
            <Textarea
              id="accolade-description"
              required
              rows={3}
              maxLength={2000}
              placeholder="Tell the story — what it was, where, and when."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label>Proof (optional)</Label>
            <FileDropzone file={file} onChange={setFile} accept="image/jpeg,image/png,image/webp,image/gif,.pdf" hint="Certificate photo, award letter, or a PDF" />
          </div>
          <Button type="submit" disabled={busy || !title.trim() || !description.trim()} icon={Sparkles}>
            {busy ? "Posting..." : "Post Accolade"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title={`Your Accolades (${items.length})`} icon={Award} />
        {items.length === 0 ? (
          <EmptyState message="No accolades posted yet." hint="Post your first one above — it'll show up here and on your proctor's radar." icon={Award} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-800">{a.title}</span>
                    {a.category && <Badge tone={CATEGORY_TONE[a.category] ?? "slate"}>{a.category}</Badge>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{a.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span>{new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                    {a.proofFile && (
                      <a href={`/api${a.proofFile}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-brand-600 hover:underline">
                        <Paperclip className="h-3 w-3" />
                        View proof
                      </a>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => remove(a.id)} aria-label={`Delete accolade: ${a.title}`} className="shrink-0 rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
