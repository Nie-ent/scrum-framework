"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setTaskProgress } from "@/app/actions/tasks";
import { useT } from "@/components/i18n";

/**
 * อัปเดต % ของงาน: แถบเลื่อนอันเดียว + ปุ่มบันทึกปุ่มเดียวที่บอกค่าที่จะบันทึก
 * (เดิมมีปุ่มลัด 0/25/50/75/เสร็จ ซึ่งคนกดแล้วนึกว่าบันทึกแล้ว) — ปุ่มกดได้เมื่อมีอะไรเปลี่ยนเท่านั้น
 */
export function ProgressForm({ id, defaultValue, label }: { id: string; defaultValue: number; label: string }) {
  const tr = useT();
  const [value, setValue] = useState(defaultValue);
  const [reason, setReason] = useState("");
  const changed = value !== defaultValue || reason.trim() !== "";
  return (
    <form action={setTaskProgress} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <div className="flex items-center gap-3">
        <input name="progress" type="range" min={0} max={100} step={5} value={value} onChange={(e) => setValue(Number(e.target.value))} aria-label={label} className="h-9 flex-1 accent-indigo-600" />
        <output className="w-12 shrink-0 text-right text-base font-semibold tabular-nums text-foreground">{value}%</output>
      </div>
      <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder={tr("เหตุผล / หมายเหตุ (ไม่บังคับ)")} aria-label={tr("เหตุผลของการอัปเดต")} className="input w-full py-2 text-sm" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{tr("การเปลี่ยนแปลงและเหตุผลจะถูกบันทึกไว้ในความคิดเห็นด้านล่าง")}</p>
        <SaveButton disabled={!changed} label={value >= 100 ? tr("บันทึกว่าเสร็จแล้ว") : tr("บันทึก {0}%", [value])} />
      </div>
    </form>
  );
}

function SaveButton({ disabled, label }: { disabled: boolean; label: string }) {
  const tr = useT();
  const { pending } = useFormStatus();
  return (
    <button disabled={disabled || pending} className="btn min-h-10 shrink-0 tabular-nums disabled:opacity-40">
      {pending ? tr("กำลังบันทึก...") : label}
    </button>
  );
}
