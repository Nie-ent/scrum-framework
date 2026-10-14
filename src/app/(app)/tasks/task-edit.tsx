"use client";

import { useActionState, useState } from "react";
import { editTask } from "@/app/actions/tasks";
import type { FormState } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";
import { Select } from "@/components/select";
import { Icon } from "@/components/icons";
import { useT } from "@/components/i18n";

/**
 * หัวแผงรายละเอียดงาน: แสดงชื่อ/รายละเอียด (view จากเซิร์ฟเวอร์) และกด "แก้ไข" เพื่อแก้ในที่เดิม
 * members มีค่า = โอนผู้รับงานได้ (หัวหน้าทีมหรือคนที่มอบหมายงานนี้)
 */
export function TaskEdit({
  task,
  members,
  selfId,
  view,
}: {
  task: { id: string; title: string; description: string | null; assigneeId: string };
  members: { id: string; name: string }[] | null;
  selfId: string;
  view: React.ReactNode;
}) {
  const tr = useT();
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await editTask(prev, formData);
    if (result?.ok) setEditing(false);
    return result;
  }, undefined);

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{view}</div>
        <button type="button" onClick={() => setEditing(true)} className="btn-ghost min-h-9 shrink-0 gap-1 px-2.5 py-1 text-sm">
          <Icon name="pencil" className="h-4 w-4" />
          {tr("แก้ไข")}
        </button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3" onKeyDown={(e) => e.key === "Escape" && setEditing(false)}>
      <input type="hidden" name="id" value={task.id} />
      <div>
        <label className="label" htmlFor="edit-title">{tr("ชื่องาน")}</label>
        <input id="edit-title" name="title" className="input" required maxLength={200} defaultValue={task.title} autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="edit-description">{tr("รายละเอียด")}</label>
        <textarea id="edit-description" name="description" rows={4} className="input resize-y" maxLength={2000} defaultValue={task.description ?? ""} placeholder={tr("พิมพ์ได้หลายบรรทัด วางลิงก์ได้")} />
      </div>
      {members && (
        <div>
          <label className="label" htmlFor="edit-assignee">{tr("ผู้รับงาน")}</label>
          <Select
            id="edit-assignee"
            name="assigneeId"
            defaultValue={task.assigneeId}
            options={members.map((m) => ({ value: m.id, label: `${m.name}${m.id === selfId ? tr(" (ฉัน)") : ""}` }))}
          />
          <p className="mt-1 text-xs text-muted-foreground">{tr("เปลี่ยนผู้รับงานแล้ว ทั้งคนใหม่และคนเดิมจะได้รับแจ้ง")}</p>
        </div>
      )}
      <FormMessage state={state} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} className="btn-ghost">{tr("ยกเลิก")}</button>
        <SubmitButton>{tr("บันทึก")}</SubmitButton>
      </div>
    </form>
  );
}
