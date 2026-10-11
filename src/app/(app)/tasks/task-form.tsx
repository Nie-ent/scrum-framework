"use client";

import { useState } from "react";
import { createTask } from "@/app/actions/tasks";
import type { FormState } from "@/app/actions/auth";
import { uploadFiles, type UploadProgress } from "@/lib/upload-client";
import { FilePicker, PickedFiles, UploadProgressBar } from "@/components/attachments";
import { TaskFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";

export function TaskForm({
  teamId,
  selfId,
  members,
  today,
  canAttach,
  defaultDue,
}: {
  teamId: string;
  selfId: string;
  /** มีค่าเมื่อเป็นหัวหน้าทีม: เลือกผู้รับงานได้ — ไม่มี = เพิ่มงานให้ตัวเองเท่านั้น */
  members: { id: string; name: string }[] | null;
  today: string;
  /** ตั้งค่าที่เก็บไฟล์แล้ว — แสดงปุ่มแนบไฟล์ */
  canAttach: boolean;
  /** วันที่เลือกมาจากหน้า ปฏิทิน */
  defaultDue?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  // สร้างงานก่อน แล้วอัปโหลดไฟล์ที่เลือกไว้เข้าไปที่งานนั้น
  const submit = async (prev: FormState, formData: FormData): Promise<FormState> => {
    const result = await createTask(prev, formData);
    if (!result?.id || files.length === 0) return result;
    const { errors } = await uploadFiles({ taskId: result.id }, files, setProgress);
    setProgress(null);
    setFiles([]);
    return errors.length > 0 ? { error: `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ — ${errors.join(" · ")}` } : result;
  };
  const { state, pending, formProps, field, error } = useZodForm(TaskFields, submit, { resetOnSuccess: true });
  const [moreOpen, setMoreOpen] = useState(Boolean(defaultDue));
  // ช่องในส่วนที่พับไว้มีข้อผิดพลาด = กางออกให้เห็น
  const hiddenError = Boolean(error("assigneeId") || error("dueDate") || error("description"));
  // เพิ่มงานได้ด้วยชื่ออย่างเดียวแล้วกด Enter — รายละเอียดอื่นเปิดเพิ่มได้
  return (
    <form {...formProps} className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <div>
        <div className="flex items-start gap-2">
          <label className="sr-only" htmlFor="task-title">ชื่องาน</label>
          <input id="task-title" className="input flex-1" maxLength={200} placeholder={members ? "เพิ่มงาน… เช่น จัดทำรายงานประจำเดือน" : "เพิ่มงานของฉัน… เช่น จัดทำรายงานประจำเดือน"} required {...field("title")} />
          <SubmitButton className="btn shrink-0" pending={pending} pendingText="กำลังเพิ่ม...">เพิ่มงาน</SubmitButton>
        </div>
        <FieldError name="title" message={error("title")} />
      </div>
      <details className="group/more" open={moreOpen || hiddenError} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-lg text-xs font-medium text-muted-foreground marker:hidden hover:text-primary">
          <span aria-hidden="true" className="transition group-open/more:rotate-90">▸</span>
          กำหนดส่ง{members ? " ผู้รับงาน" : ""} รายละเอียด{canAttach ? " และไฟล์แนบ" : ""}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_10rem]">
          <div>
            <label className="label" htmlFor="task-description">รายละเอียด</label>
            <input id="task-description" className="input" maxLength={2000} placeholder="วางลิงก์ได้" {...field("description")} />
            <FieldError name="description" message={error("description")} />
          </div>
          {members ? (
            <div>
              <label className="label" htmlFor="task-assignee">มอบหมายให้</label>
              <select id="task-assignee" className="input" defaultValue={members.some((m) => m.id === selfId) ? selfId : (members[0]?.id ?? "")} required {...field("assigneeId")}>
                <option value="" disabled>เลือกสมาชิก</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.id === selfId ? " (ฉัน)" : ""}</option>
                ))}
              </select>
              <FieldError name="assigneeId" message={error("assigneeId")} />
            </div>
          ) : (
            <input type="hidden" value={selfId} {...field("assigneeId")} />
          )}
          <div>
            <label className="label" htmlFor="task-due">กำหนดส่ง</label>
            <input id="task-due" type="date" min={today} defaultValue={defaultDue} className="input" {...field("dueDate")} />
            <FieldError name="dueDate" message={error("dueDate")} />
          </div>
          {canAttach && (
            <div className="sm:col-span-3">
              <FilePicker
                files={files}
                text="แนบไฟล์"
                onChange={(next, problem) => {
                  setFiles(next);
                  setFileError(problem);
                }}
              />
            </div>
          )}
        </div>
      </details>
      {progress ? <UploadProgressBar progress={progress} /> : <PickedFiles files={files} onRemove={(i) => setFiles(files.filter((_, n) => n !== i))} />}
      <FormMessage state={fileError ? { error: fileError } : state} />
    </form>
  );
}
