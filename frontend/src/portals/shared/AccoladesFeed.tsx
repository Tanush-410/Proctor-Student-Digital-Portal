import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, Paperclip, Sparkles } from "lucide-react";
import { api } from "../../api/client";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, SkeletonAvatarRows } from "../../components/ui";

interface AccoladeItem {
  id: number;
  usn: string;
  title: string;
  description: string;
  category: string | null;
  proofFile: string | null;
  createdAt: string;
  student: { name: string; usn: string; section: string | null };
}

const CATEGORY_TONE: Record<string, "blue" | "green" | "amber" | "red" | "slate"> = {
  Sports: "green",
  Technical: "blue",
  Cultural: "amber",
  Academic: "blue",
  Volunteering: "slate",
  Other: "slate",
};

export default function AccoladesFeed({ base }: { base: string }) {
  const [items, setItems] = useState<AccoladeItem[] | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  function load(reset: boolean, after?: number | null) {
    const params = after ? `?cursor=${after}` : "";
    api.get(`/accolades${params}`).then((res) => {
      setItems((prev) => (reset || !prev ? res.accolades : [...prev, ...res.accolades]));
      setCursor(res.nextCursor);
      setHasMore(res.nextCursor !== null);
      setLoadingMore(false);
    });
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Accolades</h1>
        <p className="mt-1 text-sm text-slate-500">
          {base === "/admin" ? "Standout achievements across the department, most recent first." : "Standout achievements from your proctees, most recent first."}
        </p>
      </div>

      <Card>
        {items === null ? (
          <SkeletonAvatarRows rows={5} />
        ) : items.length === 0 ? (
          <EmptyState message="No accolades posted yet." hint="They'll show up here as soon as a student posts one." icon={Award} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {items.map((a) => (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={a.student.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`${base}/students/${a.usn}`} className="text-sm font-semibold text-slate-800 hover:text-brand-700">
                          {a.student.name}
                        </Link>
                        <span className="font-mono text-[11px] text-slate-400">
                          {a.usn} {a.student.section && `· Sec ${a.student.section}`}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                        <span className="text-sm font-medium text-slate-700">{a.title}</span>
                        {a.category && <Badge tone={CATEGORY_TONE[a.category] ?? "slate"}>{a.category}</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{a.description}</p>
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
                  </div>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="flex justify-center border-t border-slate-100 py-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => {
                    setLoadingMore(true);
                    load(false, cursor);
                  }}
                >
                  {loadingMore ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
