"use client";

import { useActionState } from "react";
import { createTask } from "@/app/actions/tasks";
import { FormMessage, SubmitButton } from "@/components/form";

export function TaskForm({
  teamId,
  selfId,
  members,
  today,
}: {
  teamId: string;
  selfId: string;
  /** มีค่าเมื่อเป็นหัวหน้าทีม: เลือกผู้รับงานได้ — ไม่มี = เพิ่มงานให้ตัวเองเท่านั้น */
  members: { id: string; name: string }[] | null;
  today: string;
}) {
  const [state, action] = useActionState(createTask, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="sm:col-span-3">
        <label className="label" htmlFor="task-title">ชื่องาน</label>
        <input id="task-title" name="title" className="input" maxLength={200} placeholder="เช่น ทำหน้า checkout ให้รองรับ PromptPay" required />
      </div>
      <div>
        <label className="label" htmlFor="task-description">รายละเอียด <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
        <input id="task-description" name="description" className="input" maxLength={2000} />
      </div>
      {members ? (
        <div>
          <label className="label" htmlFor="task-assignee">มอบหมายให้</label>
          <select id="task-assignee" name="assigneeId" className="input" defaultValue="" required>
            <option value="" disabled>เลือกสมาชิก</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}{m.id === selfId ? " (ฉัน)" : ""}</option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="assigneeId" value={selfId} />
      )}
      <div>
        <label className="label" htmlFor="task-due">กำหนดส่ง <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
        <input id="task-due" name="dueDate" type="date" min={today} className="input" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
        <FormMessage state={state} />
        <SubmitButton className="btn ml-auto">{members ? "มอบหมายงาน" : "เพิ่มงานของฉัน"}</SubmitButton>
      </div>
    </form>
  );
}
