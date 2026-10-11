"use client";

import { requestPasswordReset } from "@/app/actions/auth";
import { ForgotFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";

export function ForgotForm() {
  const { state, pending, formProps, field, error } = useZodForm(ForgotFields, requestPasswordReset, { resetOnSuccess: true });
  return (
    <form {...formProps} className="card space-y-5">
      <div><p className="eyebrow">Reset password</p><h2 className="text-xl font-semibold text-slate-950">ลืมรหัสผ่าน</h2><p className="mt-1 text-sm text-slate-500">ใส่อีเมลของบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p></div>
      <div>
        <label className="label" htmlFor="email">อีเมล</label>
        <input className="input" id="email" type="email" autoComplete="email" required {...field("email")} />
        <FieldError name="email" message={error("email")} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังส่ง..." pending={pending}>ส่งลิงก์ตั้งรหัสผ่านใหม่</SubmitButton>
    </form>
  );
}
