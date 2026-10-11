"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/actions/notes";
import { NoteFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";

/**
 * แก้ไขโน้ตเป็น Markdown — แทรกลิงก์ไปโน้ตอื่น/งานจากรายการได้ และเตือนก่อนออกถ้ายังไม่ได้บันทึก
 * version = เวลาที่โน้ตถูกแก้ล่าสุดตอนเปิดหน้า ใช้กันการเขียนทับงานของคนอื่น
 */
export function NoteEditor({
  note,
  noteTitles,
  tasks,
}: {
  note: { id: string; title: string; content: string; version: string };
  noteTitles: string[];
  tasks: { number: number; title: string }[];
}) {
  const { state, pending, formProps, field, error } = useZodForm(NoteFields, saveNote);
  const [dirty, setDirty] = useState(false);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const content = field("content");

  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  /** แทรกข้อความที่ตำแหน่งเคอร์เซอร์ */
  const insert = (text: string) => {
    const el = area.current;
    if (!el || !text) return;
    const start = el.selectionStart ?? el.value.length;
    el.setRangeText(text, start, el.selectionEnd ?? start, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
    setDirty(true);
  };

  return (
    <form {...formProps} onChange={() => setDirty(true)} className="space-y-4">
      <input type="hidden" name="id" value={note.id} />
      <input type="hidden" name="version" value={note.version} />
      <div>
        <label className="label" htmlFor="note-title">ชื่อโน้ต</label>
        <input id="note-title" className="input text-lg font-semibold" maxLength={120} required defaultValue={note.title} {...field("title")} />
        <FieldError name="title" message={error("title")} />
      </div>
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label className="label mb-0" htmlFor="note-content">เนื้อหา <span className="font-normal text-slate-400">(Markdown)</span></label>
          <div className="flex flex-wrap gap-2">
            <select aria-label="แทรกลิงก์ไปโน้ต" className="input w-auto py-1.5 text-sm" value="" onChange={(e) => insert(`[[${e.target.value}]]`)}>
              <option value="">แทรกลิงก์ไปโน้ต…</option>
              {noteTitles.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {tasks.length > 0 && (
              <select aria-label="แทรกลิงก์ไปงาน" className="input w-auto max-w-56 py-1.5 text-sm" value="" onChange={(e) => insert(`#${e.target.value} `)}>
                <option value="">แทรกลิงก์ไปงาน…</option>
                {tasks.map((t) => <option key={t.number} value={t.number}>#{t.number} {t.title}</option>)}
              </select>
            )}
          </div>
        </div>
        <textarea
          id="note-content"
          rows={22}
          spellCheck={false}
          defaultValue={note.content}
          placeholder={"# หัวข้อ\n\nเขียนได้เลย…\n\n- ลิงก์ไปโน้ตอื่น: [[ชื่อโน้ต]]\n- อ้างถึงงาน: #12\n- [ ] รายการที่ต้องทำ"}
          className="input min-h-80 resize-y font-mono text-sm leading-6"
          {...content}
          ref={(el) => {
            content.ref(el);
            area.current = el;
          }}
        />
        <FieldError name="content" message={error("content")} />
        <p className="mt-1.5 text-xs text-slate-500">
          <code className="rounded bg-slate-100 px-1">[[ชื่อโน้ต]]</code> ลิงก์ไปโน้ตอื่น (ยังไม่มีก็เขียนได้ คลิกทีหลังเพื่อสร้าง) · <code className="rounded bg-slate-100 px-1">#12</code> ลิงก์ไปงาน · รองรับหัวข้อ รายการ ตาราง โค้ด และ checklist
        </p>
      </div>
      <FormMessage state={state} />
      <div className="flex items-center justify-end gap-2">
        <Link href={`/notes/${note.id}`} className="btn-ghost">ยกเลิก</Link>
        <SubmitButton pending={pending}>บันทึก</SubmitButton>
      </div>
    </form>
  );
}
