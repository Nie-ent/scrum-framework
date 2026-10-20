"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { NOTE_IMAGE_TYPES } from "@/lib/attachments";
import { uploadNoteImage } from "@/lib/upload-client";
import { LinkChips } from "./link-chips";
import { EditorMenus, type MenuKeyHandler } from "./editor-menus";
import { Tooltip } from "@/components/tooltip";
import { Select } from "@/components/select";
import { useT } from "@/components/i18n";

/**
 * ตัวแก้ไขแบบเห็นผลทันที (ไม่ต้องรู้ Markdown): กดปุ่มจัดรูปแบบเหมือนโปรแกรมเอกสารทั่วไป
 * เบื้องหลังยังเก็บเป็น Markdown เพื่อให้ลิงก์ [[โน้ต]] / #งาน และการแสดงผลเดิมใช้ต่อได้
 */
export function RichEditor({
  noteId,
  name,
  defaultValue,
  inputRef,
  onDirty,
  noteTitles,
  tasks,
  people = [],
}: {
  /** โน้ตที่รูปจะไปอยู่ (อัปโหลดรูปด้วยการวาง ลาก หรือปุ่ม "รูป") */
  noteId: string;
  name: string;
  defaultValue: string;
  /** ref ของช่องซ่อนที่ส่งไปกับฟอร์ม (ให้ react-hook-form รู้จักช่องนี้) */
  inputRef?: (el: HTMLInputElement | null) => void;
  onDirty?: () => void;
  noteTitles: string[];
  tasks: { number: number; title: string }[];
  people?: { id: string; name: string }[];
}) {
  const tr = useT();
  const [markdown, setMarkdown] = useState(defaultValue);
  const [linking, setLinking] = useState(false);
  // เมนู / , [[ , # รับปุ่มลูกศร/Enter/Esc ก่อนตัวแก้ไข (ดู editor-menus.tsx)
  const menuKeys = useRef<MenuKeyHandler | null>(null);
  const [uploading, setUploading] = useState(0);
  const [imageError, setImageError] = useState<string | null>(null);
  // handler ของ editorProps ถูกสร้างครั้งเดียว — เรียกผ่าน ref เพื่อให้ใช้ editor ตัวปัจจุบัน
  const addImages = useRef<(files: File[], pos?: number) => void>(() => {});
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Image.configure({ inline: true }),
      Markdown,
      LinkChips.configure({ noteTitles, taskNumbers: tasks.map((t) => t.number), people, tr }),
    ],
    content: defaultValue,
    contentType: "markdown",
    // Next.js render ฝั่ง server ก่อน — ให้ตัวแก้ไขเริ่มหลัง hydrate เพื่อไม่ให้ HTML ไม่ตรงกัน
    immediatelyRender: false,
    // ให้ปุ่มบนแถบเครื่องมือแสดงสถานะ (เช่น ตัวหนาเปิดอยู่) ตามตำแหน่งเคอร์เซอร์
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: { class: "markdown min-h-80 px-4 py-3 outline-none", "aria-label": tr("เนื้อหาโน้ต"), role: "textbox", "aria-multiline": "true" },
      handleKeyDown: (_, event) => menuKeys.current?.(event) ?? false,
      handlePaste: (_, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length === 0) return false;
        addImages.current(files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = imageFiles((event as DragEvent).dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        addImages.current(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setMarkdown(cleanMarkdown(editor.getMarkdown()));
      onDirty?.();
    },
  });

  useEffect(() => {
    addImages.current = async (files, pos) => {
      if (!editor) return;
      setImageError(null);
      setUploading((n) => n + files.length);
      for (const file of files) {
        const result = await uploadNoteImage(noteId, file, tr);
        setUploading((n) => n - 1);
        if ("error" in result) {
          setImageError(result.error);
          continue;
        }
        const image = { type: "image", attrs: { src: result.src, alt: altFrom(file.name) } };
        if (pos === undefined) editor.chain().focus().insertContent(image).run();
        else editor.chain().focus().insertContentAt(pos, image).run();
      }
    };
  }, [editor, noteId, tr]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100">
      <input type="hidden" name={name} value={markdown} ref={inputRef} readOnly />
      {editor ? (
        <Toolbar editor={editor} linking={linking} setLinking={setLinking} noteTitles={noteTitles} tasks={tasks} onImages={(files) => addImages.current(files)} />
      ) : (
        <div className="h-11 border-b border-slate-200 bg-slate-50" />
      )}
      {editor ? <EditorContent editor={editor} /> : <div className="markdown min-h-80 whitespace-pre-wrap px-4 py-3 text-slate-400">{tr("กำลังเปิดตัวแก้ไข…")}</div>}
      {editor && <EditorMenus editor={editor} noteTitles={noteTitles} tasks={tasks} people={people} keyHandler={menuKeys} />}
      {(uploading > 0 || imageError) && (
        <p role={imageError ? "alert" : "status"} className={`border-t border-slate-100 px-3 py-1.5 text-xs font-medium ${imageError ? "text-danger" : "text-primary"}`}>
          {uploading > 0 ? tr("กำลังอัปโหลดรูป {0} รูป…", [uploading]) : imageError}
        </p>
      )}
      <p className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5 text-xs text-slate-500">{tr("พิมพ์")}{" "}<kbd className="rounded bg-white px-1 font-sans ring-1 ring-slate-200">/</kbd> {tr("เพื่อแทรกหัวข้อ รายการ หรือตาราง ·")}{" "}<kbd className="rounded bg-white px-1 font-sans ring-1 ring-slate-200">[[</kbd> {tr("เชื่อมไปโน้ต ·")}{" "}<kbd className="rounded bg-white px-1 font-sans ring-1 ring-slate-200">#</kbd> {tr("เชื่อมไปงาน ·")}{" "}<kbd className="rounded bg-white px-1 font-sans ring-1 ring-slate-200">@</kbd> {tr("แท็กคน")}</p>
    </div>
  );
}

/** รูปจากการวาง/ลาก (ไฟล์อื่นปล่อยให้ตัวแก้ไขจัดการตามปกติ) */
const imageFiles = (list?: FileList | null) => Array.from(list ?? []).filter((f) => NOTE_IMAGE_TYPES.includes(f.type));

/** ชื่อไฟล์เป็นคำอธิบายรูป — ตัดนามสกุลและอักขระที่ทำให้ Markdown เพี้ยน */
const altFrom = (fileName: string) => fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[[\]\\]/g, "").slice(0, 80);

/** ขนาดรูปเก็บไว้ท้าย URL (#s เล็ก, #m กลาง, ไม่มี = เต็ม) — CSS เลือกขนาดจากตรงนี้ทั้งในตัวแก้ไขและตอนอ่าน */
const IMAGE_SIZES = [
  { suffix: "#s", label: "เล็ก" },
  { suffix: "#m", label: "กลาง" },
  { suffix: "", label: "เต็ม" },
] as const;
const sizeOf = (src: string) => /#[sm]$/.exec(src)?.[0] ?? "";

/**
 * ตัวแปลงเป็น Markdown จะใส่ \ หน้าอักขระพิเศษ — คืนรูปลิงก์ของเรา ([[ชื่อโน้ต]] และ #เลขงาน) ให้เหมือนที่ผู้ใช้เห็น
 */
export function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/\\\[\\\[([^\n]+?)\\\]\\\]/g, (_, inner: string) => `[[${inner.replace(/\\([|\[\]_*])/g, "$1")}]]`)
    .replace(/\\#(\d)/g, "#$1")
    // ตัวแปลงเว้นบรรทัดว่างเกินรอบตาราง/รายการ — เหลือบรรทัดว่างเดียว และไม่ทิ้งบรรทัดว่างท้ายโน้ต
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** ⌘ บน Mac, Ctrl ที่อื่น — แถบเครื่องมือ render ฝั่ง browser เท่านั้น จึงอ่าน navigator ได้ */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

function Button({ label, shortcut, active = false, onClick, children }: { label: string; shortcut?: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // ไม่ให้ปุ่มแย่ง focus จากตัวแก้ไข (ตำแหน่งเคอร์เซอร์/ข้อความที่เลือกจะหาย)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition ${active ? "bg-indigo-100 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-200/70"}`}
    >
      {children}
    </button>
    </Tooltip>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />;

function Toolbar({
  editor,
  linking,
  setLinking,
  noteTitles,
  tasks,
  onImages,
}: {
  editor: Editor;
  linking: boolean;
  setLinking: (open: boolean) => void;
  noteTitles: string[];
  tasks: { number: number; title: string }[];
  onImages: (files: File[]) => void;
}) {
  const tr = useT();
  const [url, setUrl] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const imageSrc: string = editor.isActive("image") ? (editor.getAttributes("image").src ?? "") : "";
  const resize = (suffix: string) => chain().updateAttributes("image", { src: imageSrc.replace(/#[sm]$/, "") + suffix }).run();
  const chain = () => editor.chain().focus();
  const applyLink = () => {
    const href = url.trim();
    if (href) chain().extendMarkRange("link").setLink({ href: /^[a-z]+:\/\//i.test(href) || href.startsWith("/") ? href : `https://${href}` }).run();
    else chain().extendMarkRange("link").unsetLink().run();
    setUrl("");
    setLinking(false);
  };

  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div role="toolbar" aria-label={tr("จัดรูปแบบ")} className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <Button label={tr("หัวข้อใหญ่ (พิมพ์ # เว้นวรรค)")} shortcut={`${MOD}Alt+1`} active={editor.isActive("heading", { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>{tr("หัวข้อ 1")}</Button>
        <Button label={tr("หัวข้อรอง (พิมพ์ ## เว้นวรรค)")} shortcut={`${MOD}Alt+2`} active={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>{tr("หัวข้อ 2")}</Button>
        <Button label={tr("หัวข้อย่อย (พิมพ์ ### เว้นวรรค)")} shortcut={`${MOD}Alt+3`} active={editor.isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}>{tr("หัวข้อ 3")}</Button>
        <Divider />
        <Button label={tr("ตัวหนา")} shortcut={`${MOD}B`} active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><b>B</b></Button>
        <Button label={tr("ตัวเอียง")} shortcut={`${MOD}I`} active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><i>I</i></Button>
        <Button label={tr("ขีดฆ่า")} shortcut={`${MOD}Shift+S`} active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}><s>S</s></Button>
        <Divider />
        <Button label={tr("รายการแบบจุด (พิมพ์ - เว้นวรรค)")} shortcut={`${MOD}Shift+8`} active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}>{tr("• รายการ")}</Button>
        <Button label={tr("รายการแบบตัวเลข (พิมพ์ 1. เว้นวรรค)")} shortcut={`${MOD}Shift+7`} active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}>{tr("1. รายการ")}</Button>
        <Button label={tr("สิ่งที่ต้องทำ ติ๊กได้ (พิมพ์ [ ] เว้นวรรค)")} shortcut={`${MOD}Shift+9`} active={editor.isActive("taskList")} onClick={() => chain().toggleTaskList().run()}>{tr("☑ สิ่งที่ต้องทำ")}</Button>
        <Divider />
        <Button label={tr("ข้อความอ้างอิง (พิมพ์ > เว้นวรรค)")} shortcut={`${MOD}Shift+B`} active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}>❝</Button>
        <Button label={tr("แทรกตาราง 3×3")} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>{tr("ตาราง")}</Button>
        {editor.isActive("table") && (
          <>
            <Button label={tr("เพิ่มแถว")} onClick={() => chain().addRowAfter().run()}>{tr("+แถว")}</Button>
            <Button label={tr("เพิ่มคอลัมน์")} onClick={() => chain().addColumnAfter().run()}>{tr("+คอลัมน์")}</Button>
            <Button label={tr("ลบตาราง")} onClick={() => chain().deleteTable().run()}>{tr("ลบตาราง")}</Button>
          </>
        )}
        <Button label={tr("ลิงก์เว็บ")} active={editor.isActive("link") || linking} onClick={() => { setUrl(editor.getAttributes("link").href ?? ""); setLinking(!linking); }}>{tr("ลิงก์")}</Button>
        <Button label={tr("ใส่รูป (หรือวาง/ลากรูปมาใส่ได้เลย)")} onClick={() => picker.current?.click()}>{tr("รูป")}</Button>
        <input
          ref={picker}
          type="file"
          accept={NOTE_IMAGE_TYPES.join(",")}
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length > 0) onImages(files);
          }}
        />
        {imageSrc && (
          <>
            <Divider />
            {IMAGE_SIZES.map((s) => (
              <Button key={s.label} label={tr("ขนาดรูป: {0}", [tr(s.label)])} active={sizeOf(imageSrc) === s.suffix} onClick={() => resize(s.suffix)}>{tr(s.label)}</Button>
            ))}
            <Button label={tr("ลบรูป")} onClick={() => chain().deleteSelection().run()}>{tr("ลบรูป")}</Button>
          </>
        )}
        <Divider />
        <Button label={tr("เลิกทำ")} shortcut={`${MOD}Z`} onClick={() => chain().undo().run()}>↶</Button>
        <Button label={tr("ทำซ้ำ")} shortcut={`${MOD}Shift+Z`} onClick={() => chain().redo().run()}>↷</Button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Select
            aria-label={tr("เชื่อมไปโน้ตอื่น")}
            size="sm"
            className="w-36"
            value=""
            placeholder={tr("+ เชื่อมไปโน้ต…")}
            onChange={(title) => chain().insertContent(`[[${title}]] `).run()}
            options={noteTitles.map((t) => ({ value: t, label: t }))}
          />
          {tasks.length > 0 && (
            <Select
              aria-label={tr("เชื่อมไปงาน")}
              size="sm"
              className="w-36"
              value=""
              placeholder={tr("+ เชื่อมไปงาน…")}
              onChange={(number) => chain().insertContent(`#${number} `).run()}
              options={tasks.map((t) => ({ value: String(t.number), label: `#${t.number} ${t.title}` }))}
            />
          )}
        </span>
      </div>
      {linking && (
        <div className="flex items-center gap-2 border-t border-slate-200 px-2 py-1.5">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            placeholder={tr("https://… (เว้นว่างเพื่อเอาลิงก์ออก)")}
            aria-label={tr("ที่อยู่ลิงก์")}
            className="input h-8 min-h-0 flex-1 py-1 text-sm"
            autoFocus
          />
          <button type="button" className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={applyLink}>{tr("ตกลง")}</button>
        </div>
      )}
    </div>
  );
}
