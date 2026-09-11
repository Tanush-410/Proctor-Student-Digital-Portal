import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageSquare, Search, Send, X } from "lucide-react";
import { api, ApiError } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useToast } from "../../components/Toast";
import { Avatar, Badge, Card, EmptyState, PageSpinner } from "../../components/ui";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface FacultyHit {
  facultyId: number;
  name: string;
  shortCode: string;
  role: string;
}

interface Thread {
  with: FacultyHit;
  lastBody: string;
  lastAt: string;
  unread: number;
}

interface Message {
  id: number;
  senderId: number;
  recipientId: number;
  body: string;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

export default function Messages() {
  const { auth } = useAuth();
  const toast = useToast();
  const me = auth && "facultyId" in auth.profile ? auth.profile.facultyId : null;

  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeWith, setActiveWith] = useState<FacultyHit | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 250);
  const [results, setResults] = useState<FacultyHit[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  function loadThreads() {
    api.get("/messages/threads").then(setThreads);
  }

  useEffect(loadThreads, []);

  function openThread(f: FacultyHit) {
    setActiveId(f.facultyId);
    setActiveWith(f);
    setSearching(false);
    setQ("");
    setMessages(null);
    api.get(`/messages/with/${f.facultyId}`).then((r) => {
      setActiveWith(r.with);
      setMessages(r.messages);
      loadThreads();
    });
  }

  useEffect(() => {
    if (!searching || !debouncedQ.trim()) {
      setResults([]);
      return;
    }
    api.get(`/proctors?q=${encodeURIComponent(debouncedQ)}`).then((r: FacultyHit[]) => setResults(r.filter((f) => f.facultyId !== me)));
  }, [debouncedQ, searching, me]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await api.post("/messages", { recipientId: activeId, body: draft.trim() });
      setDraft("");
      const r = await api.get(`/messages/with/${activeId}`);
      setMessages(r.messages);
      loadThreads();
    } catch (err) {
      toast.error("Couldn't send message", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">Direct messages between proctors and the HOD.</p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] md:divide-x md:divide-slate-100" style={{ minHeight: "32rem" }}>
          {/* Thread list — hidden on mobile once a thread is open */}
          <div className={`${activeId !== null ? "hidden md:flex" : "flex"} flex-col border-b border-slate-100 md:border-b-0`}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Conversations</span>
              <button
                onClick={() => {
                  setSearching(true);
                  setActiveId(null);
                }}
                className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50"
                aria-label="New message"
                title="New message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>

            {searching ? (
              <div className="flex flex-1 flex-col">
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search faculty..."
                    className="flex-1 border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button onClick={() => setSearching(false)} className="text-slate-400 hover:text-slate-600" aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {results.map((f) => (
                    <li key={f.facultyId}>
                      <button onClick={() => openThread(f)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50">
                        <Avatar name={f.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-800">{f.name}</div>
                          <div className="truncate text-xs text-slate-400">
                            {f.shortCode} · {f.role}
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                  {debouncedQ.trim() && results.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-400">No matches.</li>}
                </ul>
              </div>
            ) : threads === null ? (
              <PageSpinner />
            ) : threads.length === 0 ? (
              <EmptyState message="No conversations yet." hint="Tap the send icon to message a proctor or the HOD." icon={MessageSquare} />
            ) : (
              <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                {threads.map((t) => (
                  <li key={t.with.facultyId}>
                    <button
                      onClick={() => openThread(t.with)}
                      className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${activeId === t.with.facultyId ? "bg-brand-50/60" : ""}`}
                    >
                      <Avatar name={t.with.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-slate-800">{t.with.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{timeAgo(t.lastAt)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="truncate text-xs text-slate-500">{t.lastBody}</span>
                          {t.unread > 0 && <span className="ml-auto flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">{t.unread}</span>}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Active thread */}
          <div className={`${activeId === null && !searching ? "hidden md:flex" : "flex"} flex-col`}>
            {activeId === null ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-400">Select a conversation, or start a new one.</div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
                  <button onClick={() => setActiveId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
                    <X className="h-4 w-4 rotate-45" />
                  </button>
                  {activeWith && <Avatar name={activeWith.name} size="sm" />}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{activeWith?.name}</div>
                    <Badge tone={activeWith?.role === "ADMIN" ? "blue" : "slate"}>{activeWith?.role}</Badge>
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                  {messages === null ? (
                    <PageSpinner />
                  ) : (
                    messages.map((m) => {
                      const mine = m.senderId === me;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${mine ? "rounded-br-sm bg-brand-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-800"}`}>
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            <div className={`mt-1 text-right text-[10px] ${mine ? "text-brand-100" : "text-slate-400"}`}>{timeAgo(m.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={send} className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message..."
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
                  />
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    aria-label="Send"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
