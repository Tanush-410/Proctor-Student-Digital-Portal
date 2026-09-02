import { FormEvent, useEffect, useState } from "react";
import { Home, IdCard, Save, Users } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Avatar, Button, Card, CardHeader, Input, Label, PageSpinner } from "../../components/ui";

interface StudentFull {
  usn: string;
  name: string;
  section: string | null;
  admissionYear: number;
  currentSemester: number;
  quota: string | null;
  fatherName: string | null;
  fatherPhone: string | null;
  motherName: string | null;
  motherPhone: string | null;
  localAddress: string | null;
  localGuardianName: string | null;
  localGuardianPhone: string | null;
  email: string;
  proctor: { name: string; shortCode: string; email: string; cabinNo: string | null; phone: string | null } | null;
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-700">{value}</div>
    </div>
  );
}

export default function MyInfo() {
  const { auth } = useAuth();
  const toast = useToast();
  const usn = auth && "usn" in auth.profile ? auth.profile.usn : "";
  const [student, setStudent] = useState<StudentFull | null>(null);
  const [localAddress, setLocalAddress] = useState("");
  const [localGuardianName, setLocalGuardianName] = useState("");
  const [localGuardianPhone, setLocalGuardianPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!usn) return;
    api.get(`/students/${usn}`).then((s: StudentFull) => {
      setStudent(s);
      setLocalAddress(s.localAddress ?? "");
      setLocalGuardianName(s.localGuardianName ?? "");
      setLocalGuardianPhone(s.localGuardianPhone ?? "");
    });
  }, [usn]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.patch(`/students/${usn}`, { localAddress, localGuardianName, localGuardianPhone });
      setStudent(updated);
      toast.success("Saved", "Your residence and local-guardian details were updated.");
    } catch (err) {
      toast.error("Couldn't save", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!student) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={student.name} size="lg" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{student.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <span className="font-mono text-xs text-slate-400">{student.usn}</span> · Sec {student.section ?? "-"} · Sem {student.currentSemester}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader title="Academic Record Snapshot" icon={IdCard} />
        <div className="grid grid-cols-2 gap-5 px-5 py-4 sm:grid-cols-4">
          <InfoField label="USN" value={student.usn} />
          <InfoField label="Section" value={student.section ?? "-"} />
          <InfoField label="Semester" value={String(student.currentSemester)} />
          <InfoField label="Quota" value={student.quota ?? "-"} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Family & Proctor Contact" subtitle="Read-only — maintained by the department." icon={Users} />
        <div className="grid grid-cols-1 gap-5 px-5 py-4 sm:grid-cols-2">
          <InfoField label="Father" value={`${student.fatherName ?? "-"} (${student.fatherPhone ?? "-"})`} />
          <InfoField label="Mother" value={`${student.motherName ?? "-"} (${student.motherPhone ?? "-"})`} />
          <div className="sm:col-span-2">
            <InfoField
              label="Proctor"
              value={student.proctor ? `${student.proctor.name} (${student.proctor.shortCode}) — Cabin ${student.proctor.cabinNo ?? "-"}, ${student.proctor.phone ?? student.proctor.email}` : "Unassigned"}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Edit Residence & Local Guardian" icon={Home} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <Label>Local Address</Label>
            <Input value={localAddress} onChange={(e) => setLocalAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Local Guardian Name</Label>
              <Input value={localGuardianName} onChange={(e) => setLocalGuardianName(e.target.value)} />
            </div>
            <div>
              <Label>Local Guardian Phone</Label>
              <Input value={localGuardianPhone} onChange={(e) => setLocalGuardianPhone(e.target.value)} />
            </div>
          </div>
          <Button type="submit" disabled={busy} icon={Save}>
            {busy ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
