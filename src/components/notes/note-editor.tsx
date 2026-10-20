"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { saveNote } from "@/app/actions/notes";
import { NoteFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";
import { RichEditor } from "@/components/notes/rich-editor";
import { useT } from "@/components/i18n";

/**
 * แก้ไขโน้ตด้วยตัวแก้ไขแบบเห็นผลทันที — เชื่อมไปโน้ตอื่น/งานจากรายการได้ และเตือนก่อนออกถ้ายังไม่ได้บันทึก
 * version = เวลาที่โน้ตถูกแก้ล่าสุดตอนเปิดหน้า ใช้กันการเขียนทับงานของคนอื่น
 */
export function NoteEditor({
  note,
  noteTitles,
  tasks,
  people,
}: {
  note: { id: string; title: string; content: string; version: string };
  noteTitles: string[];
  tasks: { number: number; title: string }[];
  people: { id: string; name: string }[];
}) {
  const tr = useT();
  const { state, pending, formProps, field, error } = useZodForm(NoteFields, saveNote);
  const [dirty, setDirty] = useState(false);
  const content = field("content");

  useEffect(() => {
    if (!dirty || pending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  return (
    <form {...formProps} onChange={() => setDirty(true)} className="space-y-4">
      <input type="hidden" name="id" value={note.id} />
      <input type="hidden" name="version" value={note.version} />
      <div>
        <label className="label" htmlFor="note-title">{tr("ชื่อโน้ต")}</label>
        <input id="note-title" className="input text-lg font-semibold" maxLength={120} required defaultValue={note.title} {...field("title")} />
        <FieldError name="title" message={error("title")} />
      </div>
      <div>
        <p className="label">{tr("เนื้อหา")}</p>
        <RichEditor noteId={note.id} name={content.name} defaultValue={note.content} inputRef={content.ref} onDirty={() => setDirty(true)} noteTitles={noteTitles} tasks={tasks} people={people} />
        <FieldError name="content" message={error("content")} />
        <p className="mt-1.5 text-xs text-slate-500">
          {tr("ใช้ปุ่มด้านบนจัดรูปแบบได้เลย · เลือก \"เชื่อมไปโน้ต\" หรือ \"เชื่อมไปงาน\" เพื่อสร้างความสัมพันธ์ (หรือพิมพ์")}{" "}<code className="rounded bg-slate-100 px-1">{tr("[[ชื่อโน้ต]]")}</code> / <code className="rounded bg-slate-100 px-1">{tr("#เลขงาน")}</code> {tr("เองก็ได้)")}
        </p>
      </div>
      <FormMessage state={state} />
      <div className="flex items-center justify-end gap-2">
        <Link href={`/notes/${note.id}`} className="btn-ghost">{tr("ยกเลิก")}</Link>
        <SubmitButton pending={pending}>{tr("บันทึก")}</SubmitButton>
      </div>
    </form>
  );
}
