import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { CalendarClock, Download, FileX2, UserRound } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { Button, PageSpinner } from "../../components/ui";
import { RichTextDocument, isEmptyHtml } from "../../components/RichTextEditor";

interface PtmFull {
  ptmId: number;
  ptmDate: string;
  ptmTime: string;
  notes: string | null;
  createdAt: string;
  usn: string | null;
  proctor: { name: string; shortCode: string };
  student: { name: string; usn: string; section: string | null } | null;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/**
 * A bare, chrome-free "document" for one PTM record — what "View" opens in a
 * new tab. Deliberately outside PortalLayout (no sidebar/topbar): the point
 * is that it reads as a standalone printed-style page, not another app
 * screen. Access control still runs server-side per request — this page
 * just renders whatever GET /ptm/:id is willing to hand back.
 */
export default function PtmDocument() {
  const { id } = useParams<{ id: string }>();
  const { auth, loading: authLoading } = useAuth();
  const toast = useToast();
  const [record, setRecord] = useState<PtmFull | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/ptm/${id}`)
      .then(setRecord)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load this PTM record."));
  }, [id]);

  async function downloadPdf() {
    setDownloading(true);
    try {
      const blob = await api.downloadPdf(`/ptm/${id}/report`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      toast.error("Couldn't generate PDF", "Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (!authLoading && !auth) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 sm:px-8">
      <div className="mx-auto flex max-w-3xl items-center gap-2.5 pb-5">
        <img src="/bms-logo.svg" alt="BMSCE" className="h-8 w-8" />
        <span className="text-sm font-semibold text-slate-700">Proctor Diary — PTM Record</span>
      </div>

      <div className="mx-auto max-w-3xl">
        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-20 text-center shadow-card">
            <FileX2 className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">{error}</p>
          </div>
        ) : !record ? (
          <div className="rounded-2xl border border-slate-200 bg-white py-20 shadow-card">
            <PageSpinner />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-card sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <UserRound className="h-4 w-4 text-slate-400" />
                  {record.student ? `${record.student.name} (${record.student.usn})` : "General meeting — not tied to one student"}
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                  {formatDate(record.ptmDate)} at {record.ptmTime}
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Recorded by {record.proctor.name} ({record.proctor.shortCode}) · Written on {new Date(record.createdAt).toLocaleString()}
                </div>
              </div>
              <Button onClick={downloadPdf} disabled={downloading} icon={downloading ? undefined : Download} className="shrink-0">
                {downloading ? "Preparing..." : "Download PDF"}
              </Button>
            </div>

            {record.notes && !isEmptyHtml(record.notes) ? (
              <RichTextDocument html={record.notes} />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-sm text-slate-400 shadow-card">No notes were recorded for this meeting.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
