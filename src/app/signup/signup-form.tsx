"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function SignupForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signup, undefined);
  return (
    <form action={action} className="card space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div><p className="eyebrow">Get started</p><h2 className="text-xl font-semibold text-slate-950">สมัครบัญชีใหม่</h2><p className="mt-1 text-sm text-slate-500">{next ? "สมัครแล้วรับคำเชิญเข้าทีมได้ทันที" : "สมัครแล้วสร้างทีมของคุณ หรือรอรับคำเชิญจากทีม"}</p></div>
      <div>
        <label className="label" htmlFor="name">ชื่อที่แสดง</label>
        <input className="input" id="name" name="name" autoComplete="name" maxLength={100} required />
      </div>
      <div>
        <label className="label" htmlFor="email">อีเมล</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">รหัสผ่าน <span className="font-normal text-slate-400">(อย่างน้อย 8 ตัวอักษร)</span></label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pendingText="กำลังสมัคร...">สมัคร</SubmitButton>
    </form>
  );
}
