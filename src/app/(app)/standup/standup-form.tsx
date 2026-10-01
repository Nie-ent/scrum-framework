"use client";

import { useActionState, useState } from "react";
import { saveStandup } from "@/app/actions/standup";
import { FormMessage, SubmitButton } from "@/components/form";
import { TEXT_SECTIONS, type TextSectionKey } from "@/components/standup-card";
import { TaskListEditor, serializeTasks } from "@/components/task-list-editor";
import type { Task } from "@/lib/tasks";

const PLACEHOLDERS: Record<TextSectionKey, string> = {
  blockers: "มีอะไรที่ต้องให้คนอื่นช่วยไหม (ไม่มีเว้นว่างได้)",
  notWorking: "กระบวนการ/เครื่องมือ/การสื่อสารที่ไม่เวิร์ก",
  workingWell: "สิ่งที่ทำแล้วดี อยากให้ทำต่อ",
};

export function StandupForm({
  teamId,
  teamName,
  initial,
  carriedOver,
  submitted,
}: {
  teamId: string;
  teamName: string;
  initial: { yesterdayTasks: Task[]; todayTasks: Task[] } & Record<TextSectionKey, string>;
  /** "ล่าสุดทำอะไรไป" ถูกเติมจากแผนครั้งก่อน */
  carriedOver: boolean;
  submitted: boolean;
}) {
  const [state, action] = useActionState(saveStandup, undefined);
  const [yesterday, setYesterday] = useState<Task[]>(initial.yesterdayTasks);
  const [today, setToday] = useState<Task[]>(initial.todayTasks);

  const unfinished = yesterday.filter((t) => t.text.trim() && !t.done);
  const pending = unfinished.filter((t) => !today.some((p) => p.text.trim() === t.text.trim()));

  function carryUnfinished() {
    const kept = today.filter((t) => t.text.trim());
    setToday([...kept, ...pending.map((t) => ({ text: t.text.trim() }))]);
  }

  return (
    <form action={action} className="card space-y-6">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="yesterdayTasks" value={serializeTasks(yesterday)} />
      <input type="hidden" name="todayTasks" value={serializeTasks(today)} />

      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="eyebrow">Today&apos;s check-in · {teamName}</p>
          <p className="text-sm text-slate-500">ใช้เวลาเพียง 2 นาที — แชร์เฉพาะสิ่งที่ทีมต้องรู้</p>
        </div>
        <span className={`badge shrink-0 ${submitted ? "badge-success" : "badge-warning"}`}>{submitted ? "บันทึกแล้ว" : "รอเช็กอิน"}</span>
      </div>

      <div className="space-y-5">
        <div>
          <label className="label" id="yesterdayTasks-label" htmlFor="yesterdayTasks">
            ล่าสุดทำอะไรไป <span className="font-normal text-slate-400">(Yesterday)</span>
            <span className="text-rose-500"> *</span>
          </label>
          {carriedOver && (
            <p className="mb-2 text-xs text-slate-500">ยกมาจากแผนครั้งก่อนของทีมนี้ — ติ๊ก ✓ งานที่ทำเสร็จ แล้วเพิ่มงานอื่นที่ทำได้</p>
          )}
          <TaskListEditor id="yesterdayTasks" items={yesterday} onChange={setYesterday} checkable placeholder="เช่น ทำ API login เสร็จ" />
          {pending.length > 0 && (
            <button type="button" onClick={carryUnfinished} className="btn-ghost mt-2 min-h-8 px-3 py-1 text-xs">
              ↓ ยกงานที่ยังไม่เสร็จ ({pending.length}) มาทำวันนี้
            </button>
          )}
        </div>
        <div>
          <label className="label" id="todayTasks-label" htmlFor="todayTasks">
            วันนี้จะทำอะไร <span className="font-normal text-slate-400">(Today)</span>
            <span className="text-rose-500"> *</span>
          </label>
          <TaskListEditor id="todayTasks" items={today} onChange={setToday} placeholder="เช่น ต่อหน้า dashboard" />
          <p className="mt-1 pl-4 text-xs text-slate-400">งานเหล่านี้จะขึ้นเป็น &quot;ล่าสุดทำอะไรไป&quot; ในเช็กอินครั้งถัดไปของทีมนี้</p>
        </div>
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
          {TEXT_SECTIONS.map((section) => (
            <div key={section.key}>
              <label className="label" htmlFor={section.key}>
                {section.label} <span className="font-normal text-slate-400">({section.hint})</span>
              </label>
              <textarea id={section.key} name={section.key} rows={2} className="input resize-y" placeholder={PLACEHOLDERS[section.key]} defaultValue={initial[section.key]} />
            </div>
          ))}
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
