"use client";

import { useActionState, useState } from "react";
import { setTaskDue } from "@/app/actions/tasks";
import { SubmitButton } from "@/components/form";
import { useT } from "@/components/i18n";
import { DatePicker } from "@/components/date-picker";
import { todayKey } from "@/lib/dates";
import { isPostpone } from "@/lib/tasks";

/**
 * เลือกวันกำหนดส่งของงาน (เลือก "ไม่กำหนดวัน" แล้วบันทึก = ไม่มีกำหนด)
 * เลื่อนออกไปหรือเอากำหนดส่งออก ต้องใส่เหตุผล — บันทึกในเธรดของงานและแจ้งคนที่เกี่ยวข้อง
 */
export function DueForm({ id, title, dueDate }: { id: string; title: string; dueDate: string | null }) {
  const tr = useT();
  const [state, action] = useActionState(setTaskDue, undefined);
  const [value, setValue] = useState(dueDate ?? "");
  const postpone = isPostpone(dueDate, value || null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <DatePicker key={dueDate ?? ""} name="dueDate" defaultValue={dueDate ?? ""} onChange={setValue} today={todayKey()} size="sm" className="w-40" aria-label={tr("กำหนดส่งของ {0}", [title])} />
      {postpone && (
        <input
          name="reason"
          required
          maxLength={500}
          autoFocus
          placeholder={tr("เหตุผลที่เลื่อน (จำเป็น)")}
          aria-label={tr("เหตุผลที่เลื่อนกำหนดส่งของ {0}", [title])}
          className="input min-h-9 min-w-48 flex-1 basis-full py-1.5 text-sm sm:basis-56"
        />
      )}
      <SubmitButton className="btn-ghost min-h-9 px-2.5 py-1 text-xs">{postpone ? tr("เลื่อนกำหนดส่ง") : tr("บันทึกวัน")}</SubmitButton>
      {state?.error && <span role="alert" className="basis-full text-right text-xs font-medium text-rose-700">{tr(state.error)}</span>}
    </form>
  );
}
