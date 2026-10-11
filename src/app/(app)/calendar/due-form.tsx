"use client";

import { useActionState } from "react";
import { setTaskDue } from "@/app/actions/tasks";
import { SubmitButton } from "@/components/form";

/** เลือกวันกำหนดส่งของงาน (ล้างช่องแล้วบันทึก = ไม่มีกำหนด) */
export function DueForm({ id, title, dueDate }: { id: string; title: string; dueDate: string | null }) {
  const [state, action] = useActionState(setTaskDue, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input name="dueDate" type="date" defaultValue={dueDate ?? ""} aria-label={`กำหนดส่งของ ${title}`} className="input w-auto px-2 py-1.5 text-sm" />
      <SubmitButton className="btn-ghost min-h-9 px-2.5 py-1 text-xs">บันทึกวัน</SubmitButton>
      {state?.error && <span role="alert" className="basis-full text-right text-xs font-medium text-rose-700">{state.error}</span>}
    </form>
  );
}
