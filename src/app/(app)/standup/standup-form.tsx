"use client";

import { useActionState } from "react";
import { saveStandup } from "@/app/actions/standup";
import { FormMessage, SubmitButton } from "@/components/form";
import { SECTIONS, type SectionKey } from "@/components/standup-card";

const PLACEHOLDERS: Record<SectionKey, string> = {
  yesterday: "เช่น ทำ API login เสร็จ, review PR #12",
  today: "เช่น ต่อหน้า dashboard, เขียน test",
  blockers: "มีอะไรที่ต้องให้คนอื่นช่วยไหม (ไม่มีเว้นว่างได้)",
  notWorking: "กระบวนการ/เครื่องมือ/การสื่อสารที่ไม่เวิร์ก",
  workingWell: "สิ่งที่ทำแล้วดี อยากให้ทำต่อ",
};

export function StandupForm({ initial, submitted }: { initial: Record<SectionKey, string>; submitted: boolean }) {
  const [state, action] = useActionState(saveStandup, undefined);
  return (
    <form action={action} className="card space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="eyebrow">Today&apos;s check-in</p>
          <p className="text-sm text-slate-500">ใช้เวลาเพียง 2 นาที — แชร์เฉพาะสิ่งที่ทีมต้องรู้</p>
        </div>
        <span className={`badge shrink-0 ${submitted ? "badge-success" : "badge-warning"}`}>{submitted ? "บันทึกแล้ว" : "รอเช็กอิน"}</span>
      </div>
      <div className="space-y-5">
        <Field section={SECTIONS[0]} initial={initial.yesterday} required />
        <Field section={SECTIONS[1]} initial={initial.today} required />
      </div>
      {/* เปิดไว้ถ้ามีข้อมูลอยู่แล้ว — ไม่ให้ blocker ที่กรอกไว้ถูกซ่อน */}
      <details
        className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
        open={Boolean(initial.blockers || initial.notWorking || initial.workingWell)}
      >
        <summary className="cursor-pointer list-none pr-7 text-sm font-semibold text-slate-700 marker:hidden">
          <span className="relative block after:absolute after:right-0 after:top-0 after:content-['+'] group-open:after:content-['−']">มีอะไรให้ทีมช่วยหรืออยากสะท้อนเพิ่มไหม?</span>
          <span className="mt-1 block text-xs font-normal text-slate-500">Blocker และ feedback ของทีมเป็นข้อมูลเสริม</span>
        </summary>
        <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
          {SECTIONS.slice(2).map((section) => <Field key={section.key} section={section} initial={initial[section.key]} />)}
        </div>
      </details>
      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400">* จำเป็นต้องกรอก</p>
        <SubmitButton>{submitted ? "บันทึกการอัปเดต" : "ส่ง Daily Scrum"}</SubmitButton>
      </div>
    </form>
  );
}

function Field({ section, initial, required = false }: { section: (typeof SECTIONS)[number]; initial: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={section.key}>
        {section.label} <span className="font-normal text-slate-400">({section.hint})</span>
        {required && <span className="text-rose-500"> *</span>}
      </label>
      <textarea id={section.key} name={section.key} rows={required ? 4 : 2} className="input resize-y" placeholder={PLACEHOLDERS[section.key]} defaultValue={initial} required={required} />
    </div>
  );
}
