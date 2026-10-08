"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, undefined);
  return (
    <form action={action} className="card space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div><p className="eyebrow">Welcome back</p><h2 className="text-xl font-semibold text-slate-950">เข้าสู่ระบบ</h2><p className="mt-1 text-sm text-slate-500">เช็กอินและติดตามจังหวะของทีม</p></div>
      <div>
        <label className="label" htmlFor="email">อีเมล</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">รหัสผ่าน</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังเข้าสู่ระบบ...">เข้าสู่ระบบ</SubmitButton>
    </form>
  );
}
