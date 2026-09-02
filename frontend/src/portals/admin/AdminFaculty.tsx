import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Search, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Modal } from "../../components/Modal";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Input, Label, Select, SkeletonRows } from "../../components/ui";

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

interface FacultyForm {
  staffId: string;
  name: string;
  shortCode: string;
  cabinNo: string;
  telecomNo: string;
  phone: string;
  email: string;
  role: "ADMIN" | "PROCTOR";
}

const emptyForm: FacultyForm = { staffId: "", name: "", shortCode: "", cabinNo: "", telecomNo: "", phone: "", email: "", role: "PROCTOR" };

export default function AdminFaculty() {
  const toast = useToast();
  const [faculty, setFaculty] = useState<Faculty[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Faculty | null>(null);
  const [form, setForm] = useState<FacultyForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.get("/proctors").then(setFaculty);
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!faculty) return [];
    const query = q.trim().toLowerCase();
    if (!query) return faculty;
    return faculty.filter((f) => f.name.toLowerCase().includes(query) || f.shortCode.toLowerCase().includes(query) || f.email.toLowerCase().includes(query));
  }, [faculty, q]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError(null);
  }

  function startEdit(f: Faculty) {
    setEditing(f);
    setForm({
      staffId: f.staffId,
      name: f.name,
      shortCode: f.shortCode,
      cabinNo: f.cabinNo ?? "",
      telecomNo: f.telecomNo ?? "",
      phone: f.phone ?? "",
      email: f.email,
      role: f.role === "ADMIN" ? "ADMIN" : "PROCTOR",
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await api.patch(`/faculty/${editing.facultyId}`, form);
        toast.success("Faculty updated", `${form.name}'s record was saved.`);
      } else {
        await api.post("/faculty", form);
        toast.success("Faculty onboarded", `${form.name} can now log in with ${form.email}.`);
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save faculty");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Faculty</h1>
          <p className="mt-1 text-sm text-slate-500">Onboard new proctors/HODs and keep contact details current.</p>
        </div>
        <Button onClick={startCreate} icon={UserPlus}>
          Add Faculty
        </Button>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? `Edit ${editing.name}` : "New Faculty"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Staff ID</Label>
              <Input required value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} />
            </div>
            <div>
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Short Code</Label>
              <Input required value={form.shortCode} onChange={(e) => setForm({ ...form, shortCode: e.target.value })} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "ADMIN" | "PROCTOR" })}>
                <option value="PROCTOR">Proctor</option>
                <option value="ADMIN">Admin / HOD</option>
              </Select>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <Label>Cabin No.</Label>
              <Input value={form.cabinNo} onChange={(e) => setForm({ ...form, cabinNo: e.target.value })} />
            </div>
            <div>
              <Label>Telecom No.</Label>
              <Input value={form.telecomNo} onChange={(e) => setForm({ ...form, telecomNo: e.target.value })} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : editing ? "Save Changes" : "Create Faculty"}
            </Button>
          </div>
        </form>
      </Modal>

      <Card>
        <CardHeader
          title={faculty === null ? "Loading..." : `${faculty.length} faculty`}
          icon={Users}
          action={
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Filter..." value={q} onChange={(e) => setQ(e.target.value)} className="w-44 py-1.5 pl-8 text-sm" />
            </div>
          }
        />
        {faculty === null ? (
          <SkeletonRows rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState message="No faculty matched." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/70 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-5 py-2.5 font-medium">Short Code</th>
                  <th className="px-5 py-2.5 font-medium">Role</th>
                  <th className="px-5 py-2.5 font-medium">Cabin</th>
                  <th className="px-5 py-2.5 font-medium">Contact</th>
                  <th className="px-5 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.facultyId} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={f.name} size="sm" />
                        <span className="font-medium text-slate-800">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{f.shortCode}</td>
                    <td className="px-5 py-2.5">
                      <Badge tone={f.role === "ADMIN" ? "blue" : "slate"}>{f.role}</Badge>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{f.cabinNo ?? "-"}</td>
                    <td className="px-5 py-2.5 text-slate-600">{f.phone ?? f.email}</td>
                    <td className="px-5 py-2.5 text-right">
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => startEdit(f)}>
                        Edit
                      </Button>
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
