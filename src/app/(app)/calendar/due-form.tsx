"use client";

import { useActionState } from "react";
import { setTaskDue } from "@/app/actions/tasks";
import { SubmitButton } from "@/components/form";
import { useT } from "@/components/i18n";
import { DatePicker } from "@/components/date-picker";
import { todayKey } from "@/lib/dates";

/** เลือกวันกำหนดส่งของงาน (เลือก "ไม่กำหนดวัน" แล้วบันทึก = ไม่มีกำหนด) */
export function DueForm({ id, title, dueDate }: { id: string; title: string; dueDate: string | null }) {
  const tr = useT();
  const [state, action] = useActionState(setTaskDue, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <DatePicker key={dueDate ?? ""} name="dueDate" defaultValue={dueDate ?? ""} today={todayKey()} size="sm" className="w-40" aria-label={tr("กำหนดส่งของ {0}", [title])} />
      <SubmitButton className="btn-ghost min-h-9 px-2.5 py-1 text-xs">{tr("บันทึกวัน")}</SubmitButton>
      {state?.error && <span role="alert" className="basis-full text-right text-xs font-medium text-rose-700">{state.error}</span>}
    </form>
  );
}
