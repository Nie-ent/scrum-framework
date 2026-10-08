"use client";

import { useActionState, useState } from "react";
import { createTask } from "@/app/actions/tasks";
import type { FormState } from "@/app/actions/auth";
import { uploadFiles } from "@/lib/upload-client";
import { FilePicker, PickedFiles } from "@/components/attachments";
import { FormMessage, SubmitButton } from "@/components/form";

export function TaskForm({
  teamId,
  selfId,
  members,
  today,
  canAttach,
}: {
  teamId: string;
  selfId: string;
  /** มีค่าเมื่อเป็นหัวหน้าทีม: เลือกผู้รับงานได้ — ไม่มี = เพิ่มงานให้ตัวเองเท่านั้น */
  members: { id: string; name: string }[] | null;
  today: string;
  /** ตั้งค่าที่เก็บไฟล์แล้ว — แสดงปุ่มแนบไฟล์ */
  canAttach: boolean;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  // สร้างงานก่อน แล้วอัปโหลดไฟล์ที่เลือกไว้เข้าไปที่งานนั้น
  const submit = async (prev: FormState, formData: FormData): Promise<FormState> => {
    const result = await createTask(prev, formData);
    if (!result?.id || files.length === 0) return result;
    const { errors } = await uploadFiles({ taskId: result.id }, files);
    setFiles([]);
    return errors.length > 0 ? { error: `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ — ${errors.join(" · ")}` } : result;
  };
  const [state, action] = useActionState(submit, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
      <input type="hidden" name="teamId" value={teamId} />
      <div className="sm:col-span-3">
        <label className="label" htmlFor="task-title">ชื่องาน</label>
        <input id="task-title" name="title" className="input" maxLength={200} placeholder="เช่น ทำหน้า checkout ให้รองรับ PromptPay" required />
      </div>
      <div>
        <label className="label" htmlFor="task-description">รายละเอียด <span className="font-normal text-slate-400">(ไม่บังคับ)</span></label>
        <input id="task-description" name="description" className="input" maxLength={2000} placeholder="วางลิงก์ได้" />
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
        <div className="min-w-0 flex-1 space-y-2">
          <PickedFiles files={files} onRemove={(i) => setFiles(files.filter((_, n) => n !== i))} />
          <FormMessage state={fileError ? { error: fileError } : state} />
        </div>
        {canAttach && (
          <FilePicker
            files={files}
            onChange={(next, problem) => {
              setFiles(next);
              setFileError(problem);
            }}
          />
        )}
        <SubmitButton className="btn">{members ? "มอบหมายงาน" : "เพิ่มงานของฉัน"}</SubmitButton>
      </div>
    </form>
  );
}
