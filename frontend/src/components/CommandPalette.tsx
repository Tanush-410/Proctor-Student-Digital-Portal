import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, GraduationCap, Search, Users, type LucideIcon } from "lucide-react";
import { api } from "../api/client";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

/** Registers the global ⌘K / Ctrl+K shortcut to open the command palette. */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onOpen]);
}

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface FacultyHit {
  facultyId: number;
  name: string;
  shortCode: string;
  role: string;
}
interface StudentHit {
  usn: string;
  name: string;
  section: string | null;
}

type Entry =
  | { kind: "page"; key: string; label: string; sub: string; icon: LucideIcon; go: string }
  | { kind: "faculty"; key: string; label: string; sub: string; icon: LucideIcon; go: string }
  | { kind: "student"; key: string; label: string; sub: string; icon: LucideIcon; go: string };

export function CommandPalette({ open, onClose, tabs, role }: { open: boolean; onClose: () => void; tabs: Tab[]; role: "ADMIN" | "PROCTOR" }) {
  const navigate = useNavigate();
  const base = role === "ADMIN" ? "/admin" : "/proctor";
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 200);
  const [faculty, setFaculty] = useState<FacultyHit[]>([]);
  const [students, setStudents] = useState<StudentHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setFaculty([]);
      setStudents([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !debouncedQ.trim()) {
      setFaculty([]);
      setStudents([]);
      return;
    }
    api.get(`/directory/search?q=${encodeURIComponent(debouncedQ)}`).then((res) => {
      setFaculty(res.faculty ?? []);
      setStudents(res.students ?? []);
    });
  }, [debouncedQ, open]);

  const pageEntries: Entry[] = tabs
    .filter((t) => t.label.toLowerCase().includes(q.toLowerCase()) || !q.trim())
    .map((t) => ({ kind: "page", key: `page-${t.to}`, label: t.label, sub: "Go to page", icon: t.icon, go: t.to }));
  const facultyEntries: Entry[] = faculty.map((f) => ({
    kind: "faculty",
    key: `f-${f.facultyId}`,
    label: f.name,
    sub: `${f.shortCode} · ${f.role}`,
    icon: Users,
    go: `${base}/faculty/${f.facultyId}`,
  }));
  const studentEntries: Entry[] = students.map((s) => ({
    kind: "student",
    key: `s-${s.usn}`,
    label: s.name,
    sub: `${s.usn}${s.section ? ` · Sec ${s.section}` : ""}`,
    icon: GraduationCap,
    go: `${base}/students/${s.usn}`,
  }));

  const entries: Entry[] = q.trim() ? [...studentEntries, ...facultyEntries, ...pageEntries] : pageEntries;

  function activate(entry: Entry) {
    navigate(entry.go);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = entries[selected];
      if (entry) activate(entry);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div className="animate-in-fast absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-in relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-popover" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSelected(0);
            }}
            placeholder="Search students, faculty, or jump to a page..."
            className="flex-1 border-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">ESC</kbd>
        </div>

        <div className="max-h-96 overflow-y-auto py-1.5">
          {entries.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No matches.</p>
          ) : (
            entries.map((entry, i) => {
              const Icon = entry.icon;
              return (
                <button
                  key={entry.key}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => activate(entry)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selected ? "bg-brand-50" : "hover:bg-slate-50"}`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${i === selected ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-800">{entry.label}</div>
                    <div className="truncate text-xs text-slate-400">{entry.sub}</div>
                  </div>
                  {i === selected && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-brand-400" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
