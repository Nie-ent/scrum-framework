"use client";

import { useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";

/**
 * ตัวแก้ไขแบบเห็นผลทันที (ไม่ต้องรู้ Markdown): กดปุ่มจัดรูปแบบเหมือนโปรแกรมเอกสารทั่วไป
 * เบื้องหลังยังเก็บเป็น Markdown เพื่อให้ลิงก์ [[โน้ต]] / #งาน และการแสดงผลเดิมใช้ต่อได้
 */
export function RichEditor({
  name,
  defaultValue,
  inputRef,
  onDirty,
  noteTitles,
  tasks,
}: {
  name: string;
  defaultValue: string;
  /** ref ของช่องซ่อนที่ส่งไปกับฟอร์ม (ให้ react-hook-form รู้จักช่องนี้) */
  inputRef?: (el: HTMLInputElement | null) => void;
  onDirty?: () => void;
  noteTitles: string[];
  tasks: { number: number; title: string }[];
}) {
  const [markdown, setMarkdown] = useState(defaultValue);
  const [linking, setLinking] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false, link: { openOnClick: false, autolink: true } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      Markdown,
    ],
    content: defaultValue,
    contentType: "markdown",
    // Next.js render ฝั่ง server ก่อน — ให้ตัวแก้ไขเริ่มหลัง hydrate เพื่อไม่ให้ HTML ไม่ตรงกัน
    immediatelyRender: false,
    // ให้ปุ่มบนแถบเครื่องมือแสดงสถานะ (เช่น ตัวหนาเปิดอยู่) ตามตำแหน่งเคอร์เซอร์
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: "markdown min-h-80 px-4 py-3 outline-none", "aria-label": "เนื้อหาโน้ต", role: "textbox", "aria-multiline": "true" } },
    onUpdate: ({ editor }) => {
      setMarkdown(cleanMarkdown(editor.getMarkdown()));
      onDirty?.();
    },
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-100">
      <input type="hidden" name={name} value={markdown} ref={inputRef} readOnly />
      {editor ? (
        <Toolbar editor={editor} linking={linking} setLinking={setLinking} noteTitles={noteTitles} tasks={tasks} />
      ) : (
        <div className="h-11 border-b border-slate-200 bg-slate-50" />
      )}
      {editor ? <EditorContent editor={editor} /> : <div className="markdown min-h-80 whitespace-pre-wrap px-4 py-3 text-slate-400">กำลังเปิดตัวแก้ไข…</div>}
    </div>
  );
}

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

function Button({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // ไม่ให้ปุ่มแย่ง focus จากตัวแก้ไข (ตำแหน่งเคอร์เซอร์/ข้อความที่เลือกจะหาย)
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition ${active ? "bg-indigo-100 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-200/70"}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-0.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />;

function Toolbar({
  editor,
  linking,
  setLinking,
  noteTitles,
  tasks,
}: {
  editor: Editor;
  linking: boolean;
  setLinking: (open: boolean) => void;
  noteTitles: string[];
  tasks: { number: number; title: string }[];
}) {
  const [url, setUrl] = useState("");
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
      <div role="toolbar" aria-label="จัดรูปแบบ" className="flex flex-wrap items-center gap-0.5 px-2 py-1.5">
        <Button label="หัวข้อใหญ่" active={editor.isActive("heading", { level: 1 })} onClick={() => chain().toggleHeading({ level: 1 }).run()}>หัวข้อ 1</Button>
        <Button label="หัวข้อรอง" active={editor.isActive("heading", { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>หัวข้อ 2</Button>
        <Button label="หัวข้อย่อย" active={editor.isActive("heading", { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}>หัวข้อ 3</Button>
        <Divider />
        <Button label="ตัวหนา" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()}><b>B</b></Button>
        <Button label="ตัวเอียง" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()}><i>I</i></Button>
        <Button label="ขีดฆ่า" active={editor.isActive("strike")} onClick={() => chain().toggleStrike().run()}><s>S</s></Button>
        <Divider />
        <Button label="รายการแบบจุด" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()}>• รายการ</Button>
        <Button label="รายการแบบตัวเลข" active={editor.isActive("orderedList")} onClick={() => chain().toggleOrderedList().run()}>1. รายการ</Button>
        <Button label="รายการสิ่งที่ต้องทำ (ติ๊กได้)" active={editor.isActive("taskList")} onClick={() => chain().toggleTaskList().run()}>☑ สิ่งที่ต้องทำ</Button>
        <Divider />
        <Button label="ข้อความอ้างอิง" active={editor.isActive("blockquote")} onClick={() => chain().toggleBlockquote().run()}>❝</Button>
        <Button label="แทรกตาราง 3×3" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>ตาราง</Button>
        {editor.isActive("table") && (
          <>
            <Button label="เพิ่มแถว" onClick={() => chain().addRowAfter().run()}>+แถว</Button>
            <Button label="เพิ่มคอลัมน์" onClick={() => chain().addColumnAfter().run()}>+คอลัมน์</Button>
            <Button label="ลบตาราง" onClick={() => chain().deleteTable().run()}>ลบตาราง</Button>
          </>
        )}
        <Button label="ลิงก์เว็บ" active={editor.isActive("link") || linking} onClick={() => { setUrl(editor.getAttributes("link").href ?? ""); setLinking(!linking); }}>ลิงก์</Button>
        <Divider />
        <Button label="เลิกทำ" onClick={() => chain().undo().run()}>↶</Button>
        <Button label="ทำซ้ำ" onClick={() => chain().redo().run()}>↷</Button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <select
            aria-label="เชื่อมไปโน้ตอื่น"
            className="h-8 max-w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
            value=""
            onChange={(e) => e.target.value && chain().insertContent(`[[${e.target.value}]] `).run()}
          >
            <option value="">+ เชื่อมไปโน้ต…</option>
            {noteTitles.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          {tasks.length > 0 && (
            <select
              aria-label="เชื่อมไปงาน"
              className="h-8 max-w-44 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
              value=""
              onChange={(e) => e.target.value && chain().insertContent(`#${e.target.value} `).run()}
            >
              <option value="">+ เชื่อมไปงาน…</option>
              {tasks.map((t) => <option key={t.number} value={t.number}>#{t.number} {t.title}</option>)}
            </select>
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
            placeholder="https://… (เว้นว่างเพื่อเอาลิงก์ออก)"
            aria-label="ที่อยู่ลิงก์"
            className="input h-8 flex-1 py-1 text-sm"
            autoFocus
          />
          <button type="button" className="btn-ghost min-h-8 px-3 py-1 text-xs" onClick={applyLink}>ตกลง</button>
        </div>
      )}
    </div>
  );
}
