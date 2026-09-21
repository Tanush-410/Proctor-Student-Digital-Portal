import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import DOMPurify from "dompurify";
import { Bold, Heading2, Italic, List, ListOrdered, Underline as UnderlineIcon, Undo2, Redo2 } from "lucide-react";

/** The exact set of tags/attrs this editor's schema can ever produce — used
 * to sanitize notes on every render, not just the ones written through this
 * editor. Notes are proctor-authored HTML shown to other staff and to the
 * student it's about; anyone who can reach the API directly (a compromised
 * account, a stray script) could otherwise store a real stored-XSS payload
 * that executes in someone else's session the next time the record is
 * viewed. Sanitizing here, not just trusting the editor, is what actually
 * closes that off. */
/** TipTap's "empty" content is still `<p></p>`, not "" — the actual
 * has-anything-been-written check, shared by every place that decides
 * whether to render a note at all. */
export function isEmptyHtml(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").trim().length === 0;
}

export function sanitizeNoteHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "strong", "em", "u", "s", "ul", "ol", "li", "h2", "h3", "br"],
    ALLOWED_ATTR: [],
  });
}

function ToolbarButton({ onClick, active, disabled, label, icon: Icon }: { onClick: () => void; active?: boolean; disabled?: boolean; label: string; icon: typeof Bold }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? "bg-brand-100 text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
      <ToolbarButton label="Bold" icon={Bold} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolbarButton label="Italic" icon={Italic} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolbarButton label="Underline" icon={UnderlineIcon} active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
      <div className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarButton label="Heading" icon={Heading2} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
      <ToolbarButton label="Bullet list" icon={List} active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolbarButton label="Numbered list" icon={ListOrdered} active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <div className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarButton label="Undo" icon={Undo2} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
      <ToolbarButton label="Redo" icon={Redo2} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
    </div>
  );
}

/** A Word-style note composer: a formatting toolbar over a white "page" with
 * the same big BMS crest watermark the generated PDF reports carry, so a
 * PTM note reads as a real document rather than a plain textarea. */
export function RichTextEditor({ content, onChange, placeholder }: { content: string; onChange: (html: string) => void; placeholder?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2] } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? "Attendees, topics discussed, follow-ups..." }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[9rem]" },
    },
  });

  if (!editor) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      <Toolbar editor={editor} />
      <div className="relative px-7 py-6">
        <img
          src="/bms-logo.svg"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 opacity-[0.05]"
        />
        <EditorContent editor={editor} className="relative z-10" />
      </div>
    </div>
  );
}

/** Read-only rendering of a saved note's HTML — same document-page/watermark
 * treatment as the editor, so viewing a past PTM note looks like reopening
 * the same page rather than a plain summary. */
export function RichTextDocument({ html, compact }: { html: string; compact?: boolean }) {
  const clean = sanitizeNoteHtml(html);
  return (
    <div className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white ${compact ? "" : "shadow-card"}`}>
      <img
        src="/bms-logo.svg"
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.05] ${compact ? "h-40 w-40" : "h-64 w-64"}`}
      />
      <div className={`relative z-10 prose prose-sm max-w-none ${compact ? "px-4 py-3" : "px-7 py-6"}`} dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}
