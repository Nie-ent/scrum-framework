"use client";

import { useActionState } from "react";
import { resetPassword } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPassword, undefined);
  return (
    <form action={action} className="card space-y-5">
      <input type="hidden" name="token" value={token} />
      <div><p className="eyebrow">Reset password</p><h2 className="text-xl font-semibold text-slate-950">ตั้งรหัสผ่านใหม่</h2></div>
      <div>
        <label className="label" htmlFor="next">รหัสผ่านใหม่ <span className="font-normal text-slate-400">(อย่างน้อย 8 ตัวอักษร)</span></label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">ยืนยันรหัสผ่านใหม่</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full">บันทึกและเข้าสู่ระบบ</SubmitButton>
    </form>
  );
}
