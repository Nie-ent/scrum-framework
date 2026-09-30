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

const REQUIRED: SectionKey[] = ["yesterday", "today"];

export function StandupForm({ initial, submitted }: { initial: Record<SectionKey, string>; submitted: boolean }) {
  const [state, action] = useActionState(saveStandup, undefined);
  return (
    <form action={action} className="card space-y-4">
      {SECTIONS.map((s) => (
        <div key={s.key}>
          <label className="label" htmlFor={s.key}>
            {s.label} <span className="font-normal text-slate-400">({s.hint})</span>
            {REQUIRED.includes(s.key) && <span className="text-red-500"> *</span>}
          </label>
          <textarea
            id={s.key}
            name={s.key}
            rows={s.key === "yesterday" || s.key === "today" ? 4 : 2}
            className="input"
            placeholder={PLACEHOLDERS[s.key]}
            defaultValue={initial[s.key]}
            required={REQUIRED.includes(s.key)}
          />
        </div>
      ))}
      <FormMessage state={state} />
      <SubmitButton>{submitted ? "อัปเดต" : "ส่ง Daily Scrum"}</SubmitButton>
    </form>
  );
}
