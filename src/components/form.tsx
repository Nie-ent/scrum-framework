"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions/auth";

export function SubmitButton({
  children,
  className = "btn",
  pendingText = "กำลังบันทึก...",
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state?.error) {
    return <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>;
  }
  if (state?.ok) {
    return <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{state.ok}</p>;
  }
  return null;
}
