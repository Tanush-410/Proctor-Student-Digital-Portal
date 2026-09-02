import { useRef, useState } from "react";
import { CheckCircle2, UploadCloud, X } from "lucide-react";

export function FileDropzone({
  file,
  onChange,
  accept,
  hint,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
  hint?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onChange(dropped);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">{file.name}</div>
          <div className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</div>
        </div>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragging ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50"
      }`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${dragging ? "bg-brand-100 text-brand-600" : "bg-white text-slate-400 shadow-xs"}`}>
        <UploadCloud className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-slate-700">
        <span className="text-brand-600">Click to upload</span> or drag and drop
      </p>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}
