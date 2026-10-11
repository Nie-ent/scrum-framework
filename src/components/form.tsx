"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/auth";
import { useT } from "@/components/i18n";

export function SubmitButton({
  children,
  className = "btn",
  pendingText = "กำลังบันทึก...",
  disabled = false,
  pending: pendingOverride,
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
  disabled?: boolean;
  /** ระบุเองเมื่อฟอร์มเรียก action ผ่าน useZodForm (useFormStatus ไม่รู้สถานะในกรณีนั้น) */
  pending?: boolean;
}) {
  const tr = useT();
  const status = useFormStatus();
  const pending = pendingOverride ?? status.pending;
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? tr(pendingText) : children}
    </button>
  );
}

/** ข้อความจาก server action เป็นภาษาไทย — แปลตอนแสดง (ไม่มีคำแปลก็แสดงตามเดิม) */
export function FormMessage({ state }: { state: FormState }) {
  const tr = useT();
  if (state?.error) {
    return <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{tr(state.error)}</p>;
  }
  if (state?.ok) {
    return <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{tr(state.ok)}</p>;
  }
  return null;
}
