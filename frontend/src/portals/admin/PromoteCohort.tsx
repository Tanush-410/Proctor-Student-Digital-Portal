import { FormEvent, useState } from "react";
import { TrendingUp } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useToast } from "../../components/Toast";
import { ConfirmModal } from "../../components/Modal";
import { Button, Card, CardHeader, Input, Label } from "../../components/ui";

export default function PromoteCohort() {
  const toast = useToast();
  const [section, setSection] = useState("");
  const [maxSemester, setMaxSemester] = useState("8");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setConfirmOpen(true);
  }

  async function doPromote() {
    setBusy(true);
    try {
      const res = await api.post("/admin/cohort/promote", {
        section: section.trim() || undefined,
        maxSemester: maxSemester ? parseInt(maxSemester, 10) : undefined,
      });
      toast.success("Cohort promoted", `${res.promoted} student(s) advanced by one semester.`);
      setConfirmOpen(false);
    } catch (err) {
      toast.error("Promotion failed", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Promote Cohort</h1>
        <p className="mt-1 text-sm text-slate-500">Advances current_semester by one for the selected students. Irreversible — double-check scope first.</p>
      </div>

      <Card>
        <CardHeader title="Advance Semester" icon={TrendingUp} />
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Section (optional — leave blank for all)</Label>
              <Input placeholder="e.g. A" value={section} onChange={(e) => setSection(e.target.value)} />
            </div>
            <div>
              <Label>Only promote if below semester</Label>
              <Input type="number" min={1} max={8} value={maxSemester} onChange={(e) => setMaxSemester(e.target.value)} />
            </div>
          </div>
          <Button type="submit" icon={TrendingUp}>
            Promote Cohort
          </Button>
        </form>
      </Card>

      <ConfirmModal
        open={confirmOpen}
        title="Promote this cohort?"
        description={`This advances current_semester by one for ${section.trim() ? `section ${section.trim()}` : "every matching student"}${maxSemester ? ` currently below semester ${maxSemester}` : ""}. This cannot be undone automatically.`}
        confirmLabel="Promote"
        tone="danger"
        busy={busy}
        onConfirm={doPromote}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
