"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function ForgotForm() {
  const [state, action] = useActionState(requestPasswordReset, undefined);
  return (
    <form action={action} className="card space-y-5">
      <div><p className="eyebrow">Reset password</p><h2 className="text-xl font-semibold text-slate-950">ลืมรหัสผ่าน</h2><p className="mt-1 text-sm text-slate-500">ใส่อีเมลของบัญชี เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้</p></div>
      <div>
        <label className="label" htmlFor="email">อีเมล</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังส่ง...">ส่งลิงก์ตั้งรหัสผ่านใหม่</SubmitButton>
    </form>
  );
}
