"use client";

import { useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { noteKey } from "@/lib/note-links";
import { useT } from "@/components/i18n";
import type { Translate } from "@/lib/i18n/core";

/**
 * เมนูที่เด้งขึ้นระหว่างพิมพ์ในตัวแก้ไขโน้ต
 * - พิมพ์ /  → รายการคำสั่งจัดรูปแบบ (กรองได้ด้วยการพิมพ์ต่อ)
 * - พิมพ์ [[ → รายชื่อโน้ตให้เลือกเชื่อม (ชื่อที่ยังไม่มี = เสนอให้สร้าง)
 * - พิมพ์ #  → รายการงานให้เลือกเชื่อม
 * - พิมพ์ @  → รายชื่อคนในพื้นที่ให้แท็ก (คนที่ถูกแท็กได้แจ้งเตือนเมื่อบันทึก)
 * ↑ ↓ เลือก · Enter/Tab ยืนยัน · Esc ปิด
 * และแถบเครื่องมือลอยเมื่อเลือกข้อความ (เฉพาะอุปกรณ์ที่ใช้เมาส์ — จอสัมผัสมีเมนูของระบบอยู่แล้ว)
 */

type Trigger = { kind: "slash" | "note" | "task" | "person"; query: string; from: number; to: number };
type Item = { key: string; label: string; hint?: string; run: (editor: Editor, range: { from: number; to: number }) => void };

/** ข้อความก่อนเคอร์เซอร์ในบรรทัดนี้บอกว่ากำลังพิมพ์คำสั่งแบบไหนอยู่ */
export function detectTrigger(editor: Editor): Trigger | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
  let m: RegExpExecArray | null;
  if ((m = /\[\[([^\[\]|\n]{0,60})$/.exec(before))) return { kind: "note", query: m[1], from: $from.pos - m[0].length, to: $from.pos };
  if ((m = /(?:^|\s)\/([^\s/]{0,20})$/.exec(before))) return { kind: "slash", query: m[1], from: $from.pos - m[1].length - 1, to: $from.pos };
  if ((m = /(?:^|\s)#([^\s#]{0,30})$/.exec(before))) return { kind: "task", query: m[1], from: $from.pos - m[1].length - 1, to: $from.pos };
  if ((m = /(?:^|[\s(])@([^\n@]{0,30})$/.exec(before))) return { kind: "person", query: m[1], from: $from.pos - m[1].length - 1, to: $from.pos };
  return null;
}

const COMMANDS: (Item & { words: string })[] = [
  { key: "h1", label: "หัวข้อใหญ่", hint: "# เว้นวรรค", words: "หัวข้อ ใหญ่ h1 heading title", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run() },
  { key: "h2", label: "หัวข้อรอง", hint: "## เว้นวรรค", words: "หัวข้อ รอง h2 sub heading", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run() },
  { key: "h3", label: "หัวข้อย่อย", hint: "### เว้นวรรค", words: "หัวข้อ ย่อย h3", run: (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run() },
  { key: "p", label: "ข้อความธรรมดา", words: "ข้อความ ธรรมดา ย่อหน้า text paragraph", run: (e, r) => e.chain().focus().deleteRange(r).setParagraph().run() },
  { key: "ul", label: "รายการแบบจุด", hint: "- เว้นวรรค", words: "รายการ จุด bullet list", run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run() },
  { key: "ol", label: "รายการแบบตัวเลข", hint: "1. เว้นวรรค", words: "รายการ ตัวเลข ลำดับ number list", run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run() },
  { key: "todo", label: "สิ่งที่ต้องทำ (ติ๊กได้)", hint: "[ ] เว้นวรรค", words: "สิ่งที่ต้องทำ ติ๊ก เช็ก todo task check", run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run() },
  { key: "quote", label: "ข้อความอ้างอิง", hint: "> เว้นวรรค", words: "อ้างอิง คำพูด quote", run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run() },
  { key: "table", label: "ตาราง", words: "ตาราง table", run: (e, r) => e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { key: "hr", label: "เส้นคั่น", hint: "---", words: "เส้น คั่น แบ่ง divider line", run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run() },
  { key: "note", label: "เชื่อมไปโน้ต", hint: "[[", words: "เชื่อม ลิงก์ โน้ต link note", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("[[").run() },
  { key: "task", label: "เชื่อมไปงาน", hint: "#", words: "เชื่อม ลิงก์ งาน link task", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("#").run() },
  { key: "person", label: "แท็กคน", hint: "@", words: "แท็ก คน กล่าวถึง mention person tag", run: (e, r) => e.chain().focus().deleteRange(r).insertContent("@").run() },
];

function itemsFor(trigger: Trigger, noteTitles: string[], tasks: { number: number; title: string }[], people: { id: string; name: string }[], tr: Translate): Item[] {
  const q = trigger.query.trim().toLowerCase();
  if (trigger.kind === "person") {
    return people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8).map((p) => ({ key: p.id, label: p.name, run: (e, r) => e.chain().focus().deleteRange(r).insertContent(`@${p.name} `).run() }));
  }
  if (trigger.kind === "slash") {
    // ค้นได้ทั้งชื่อคำสั่งในภาษาที่ใช้อยู่และคำค้นสำรอง (ไทย/อังกฤษ)
    return COMMANDS.map((c) => ({ ...c, label: tr(c.label), hint: c.hint && tr(c.hint) })).filter((c) => !q || c.label.toLowerCase().includes(q) || c.words.includes(q));
  }
  if (trigger.kind === "note") {
    const found = noteTitles.filter((t) => t.toLowerCase().includes(q)).slice(0, 8);
    const items: Item[] = found.map((title) => ({ key: title, label: title, run: (e, r) => e.chain().focus().deleteRange(r).insertContent(`[[${title}]] `).run() }));
    const typed = trigger.query.trim();
    if (typed && !noteTitles.some((t) => noteKey(t) === noteKey(typed))) {
      items.push({ key: "\u0000new", label: tr("สร้างโน้ต “{0}”", [typed]), hint: tr("สร้างได้หลังบันทึก"), run: (e, r) => e.chain().focus().deleteRange(r).insertContent(`[[${typed}]] `).run() });
    }
    return items;
  }
  return tasks
    .filter((t) => !q || String(t.number).startsWith(q) || t.title.toLowerCase().includes(q))
    // เลขที่พิมพ์ตรงเป๊ะขึ้นก่อน (#3 ต้องได้งานเลข 3 ไม่ใช่ 31, 32…)
    .sort((a, b) => Number(String(b.number) === q) - Number(String(a.number) === q))
    .slice(0, 8)
    .map((t) => ({ key: String(t.number), label: `#${t.number} ${t.title}`, run: (e, r) => e.chain().focus().deleteRange(r).insertContent(`#${t.number} `).run() }));
}

const TITLES = { slash: "แทรกหรือจัดรูปแบบ", note: "เชื่อมไปโน้ต", task: "เชื่อมไปงาน", person: "แท็กคน" };

/** ตำแหน่งบนจอของตำแหน่งในเอกสาร — null ถ้าคำนวณไม่ได้ (เช่น ตัวแก้ไขยังไม่พร้อม) */
function coords(editor: Editor, pos: number) {
  try {
    return editor.view.coordsAtPos(pos);
  } catch {
    return null;
  }
}

export type MenuKeyHandler = (event: KeyboardEvent) => boolean;

export function EditorMenus({
  editor,
  noteTitles,
  tasks,
  people,
  keyHandler: keyHandlerRef,
}: {
  editor: Editor;
  noteTitles: string[];
  tasks: { number: number; title: string }[];
  people: { id: string; name: string }[];
  /** ตัวแก้ไขเรียกก่อนจัดการปุ่มเอง — คืน true = เมนูรับปุ่มนี้ไปแล้ว */
  keyHandler: React.RefObject<MenuKeyHandler | null>;
}) {
  const tr = useT();
  // จำตำแหน่งที่เลือกคู่กับคำค้น — คำค้นเปลี่ยน = เริ่มจากรายการแรกใหม่
  const [pick, setPick] = useState({ signature: "", index: 0 });
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [, repaint] = useReducer((n: number) => n + 1, 0);

  // เคอร์เซอร์อยู่ในตัวแก้ไขจริง ๆ (กดไปที่อื่นแล้วเมนูต้องหาย)
  const focused = typeof document !== "undefined" && document.activeElement === editor.view.dom;
  const trigger = focused ? detectTrigger(editor) : null;
  const items = trigger && trigger.from !== dismissed ? itemsFor(trigger, noteTitles, tasks, people, tr) : [];
  const open = Boolean(trigger) && items.length > 0;
  const signature = trigger ? `${trigger.kind}:${trigger.from}:${trigger.query}` : "";
  const active = pick.signature === signature ? Math.min(pick.index, items.length - 1) : 0;
  const setIndex = (index: number) => setPick({ signature, index });

  useEffect(() => {
    keyHandlerRef.current = (event) => {
      if (!open || !trigger) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        setIndex(((active + (event.key === "ArrowDown" ? 1 : -1)) % items.length + items.length) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        items[active].run(editor, { from: trigger.from, to: trigger.to });
        return true;
      }
      if (event.key === "Escape") {
        setDismissed(trigger.from);
        return true;
      }
      return false;
    };
  });

  // เมนูใช้ตำแหน่งบนจอ — เลื่อนหน้าหรือเปลี่ยนขนาดแล้วต้องวาดใหม่
  const floating = open || !editor.state.selection.empty;
  useEffect(() => {
    if (!floating) return;
    window.addEventListener("scroll", repaint, true);
    window.addEventListener("resize", repaint);
    return () => {
      window.removeEventListener("scroll", repaint, true);
      window.removeEventListener("resize", repaint);
    };
  }, [floating]);

  if (typeof document === "undefined") return null;

  const menuAt = open && trigger ? coords(editor, trigger.from) : null;
  const { from, to, empty } = editor.state.selection;
  const selectionAt = !open && !empty && focused && !editor.isActive("codeBlock") ? coords(editor, from) : null;
  const press = (fn: () => void) => ({ onMouseDown: (e: React.MouseEvent) => e.preventDefault(), onClick: fn });
  const bubble = "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm transition";

  return createPortal(
    <>
      {menuAt && trigger && (
        <div
          role="listbox"
          aria-label={tr(TITLES[trigger.kind])}
          style={{ left: Math.max(8, Math.min(menuAt.left, window.innerWidth - 296)), top: menuAt.bottom + 6 > window.innerHeight - 260 ? undefined : menuAt.bottom + 6, bottom: menuAt.bottom + 6 > window.innerHeight - 260 ? window.innerHeight - menuAt.top + 6 : undefined }}
          className="tooltip-pop fixed z-[90] max-h-64 w-72 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-overlay"
        >
          <p className="px-2.5 py-1.5 text-2xs font-semibold uppercase tracking-[0.08em] text-subtle">{tr(TITLES[trigger.kind])}</p>
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === active}
              {...press(() => item.run(editor, { from: trigger.from, to: trigger.to }))}
              onMouseEnter={() => setIndex(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-primary-soft text-primary-strong" : "text-foreground"}`}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {item.hint && <kbd className="shrink-0 font-sans text-2xs text-subtle">{item.hint}</kbd>}
            </button>
          ))}
          <p className="border-t border-border px-2.5 py-1.5 text-2xs text-subtle">{tr("↑ ↓ เลือก · Enter ยืนยัน · Esc ปิด")}</p>
        </div>
      )}
      {selectionAt && to - from > 0 && (
        <div
          role="toolbar"
          aria-label={tr("จัดรูปแบบข้อความที่เลือก")}
          style={{ left: Math.max(8, Math.min(selectionAt.left, window.innerWidth - 250)), top: Math.max(8, selectionAt.top - 46) }}
          className="fine-only tooltip-pop fixed z-[90] items-center gap-0.5 rounded-lg bg-tooltip p-1 text-tooltip-foreground shadow-raised"
        >
          <button type="button" aria-label={tr("ตัวหนา")} aria-pressed={editor.isActive("bold")} {...press(() => editor.chain().focus().toggleBold().run())} className={`${bubble} ${editor.isActive("bold") ? "bg-white/20" : "hover:bg-white/10"}`}><b>B</b></button>
          <button type="button" aria-label={tr("ตัวเอียง")} aria-pressed={editor.isActive("italic")} {...press(() => editor.chain().focus().toggleItalic().run())} className={`${bubble} ${editor.isActive("italic") ? "bg-white/20" : "hover:bg-white/10"}`}><i>I</i></button>
          <button type="button" aria-label={tr("ขีดฆ่า")} aria-pressed={editor.isActive("strike")} {...press(() => editor.chain().focus().toggleStrike().run())} className={`${bubble} ${editor.isActive("strike") ? "bg-white/20" : "hover:bg-white/10"}`}><s>S</s></button>
          <span className="mx-0.5 h-5 w-px bg-white/20" aria-hidden="true" />
          <button type="button" aria-label={tr("ทำเป็นหัวข้อรอง")} aria-pressed={editor.isActive("heading", { level: 2 })} {...press(() => editor.chain().focus().toggleHeading({ level: 2 }).run())} className={`${bubble} ${editor.isActive("heading", { level: 2 }) ? "bg-white/20" : "hover:bg-white/10"}`}>{tr("หัวข้อ")}</button>
          <button type="button" aria-label={tr("ทำเป็นรายการ")} aria-pressed={editor.isActive("bulletList")} {...press(() => editor.chain().focus().toggleBulletList().run())} className={`${bubble} ${editor.isActive("bulletList") ? "bg-white/20" : "hover:bg-white/10"}`}>{tr("• รายการ")}</button>
          <button type="button" aria-label={tr("ทำเป็นสิ่งที่ต้องทำ")} aria-pressed={editor.isActive("taskList")} {...press(() => editor.chain().focus().toggleTaskList().run())} className={`${bubble} ${editor.isActive("taskList") ? "bg-white/20" : "hover:bg-white/10"}`}>☑</button>
        </div>
      )}
    </>,
    document.body,
  );
}
