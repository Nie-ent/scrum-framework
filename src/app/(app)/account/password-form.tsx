"use client";

import { changePassword } from "@/app/actions/auth";
import { ChangePasswordFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";

export function PasswordForm() {
  const { state, pending, formProps, field, error } = useZodForm(ChangePasswordFields, changePassword, { resetOnSuccess: true });
  return (
    <form {...formProps} className="card space-y-3">
      <h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2>
      <div>
        <input className="input" type="password" placeholder="รหัสผ่านปัจจุบัน" aria-label="รหัสผ่านปัจจุบัน" autoComplete="current-password" required {...field("current")} />
        <FieldError name="current" message={error("current")} />
      </div>
      <div>
        <input className="input" type="password" placeholder="รหัสผ่านใหม่ (8 ตัวขึ้นไป)" aria-label="รหัสผ่านใหม่" autoComplete="new-password" minLength={8} required {...field("next")} />
        <FieldError name="next" message={error("next")} />
      </div>
      <div>
        <input className="input" type="password" placeholder="ยืนยันรหัสผ่านใหม่" aria-label="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" required {...field("confirm")} />
        <FieldError name="confirm" message={error("confirm")} />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending}>เปลี่ยนรหัสผ่าน</SubmitButton>
    </form>
  );
}
