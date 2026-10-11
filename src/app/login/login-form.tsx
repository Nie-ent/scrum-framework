"use client";

import { login } from "@/app/actions/auth";
import { LoginFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, formProps, field, error } = useZodForm(LoginFields, login);
  return (
    <form {...formProps} className="card space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div><p className="eyebrow">ยินดีต้อนรับกลับ</p><h2 className="text-xl font-semibold text-slate-950">เข้าสู่ระบบ</h2><p className="mt-1 text-sm text-slate-500">จัดการงาน บันทึก และทีมของคุณ</p></div>
      <div>
        <label className="label" htmlFor="email">อีเมล</label>
        <input className="input" id="email" type="email" autoComplete="email" required {...field("email")} />
        <FieldError name="email" message={error("email")} />
      </div>
      <div>
        <label className="label" htmlFor="password">รหัสผ่าน</label>
        <input className="input" id="password" type="password" autoComplete="current-password" required {...field("password")} />
        <FieldError name="password" message={error("password")} />
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border-slate-300 accent-indigo-600" />
        จดจำฉันไว้ในเครื่องนี้ <span className="text-slate-400">(30 วัน)</span>
      </label>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังเข้าสู่ระบบ..." pending={pending}>เข้าสู่ระบบ</SubmitButton>
    </form>
  );
}
