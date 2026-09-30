"use client";

import { useActionState } from "react";
import { changePassword } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/form";

export function PasswordForm() {
  const [state, action] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-semibold">เปลี่ยนรหัสผ่าน</h2>
      <input className="input" name="current" type="password" placeholder="รหัสผ่านปัจจุบัน" autoComplete="current-password" required />
      <input className="input" name="next" type="password" placeholder="รหัสผ่านใหม่ (8 ตัวขึ้นไป)" autoComplete="new-password" minLength={8} required />
      <input className="input" name="confirm" type="password" placeholder="ยืนยันรหัสผ่านใหม่" autoComplete="new-password" required />
      <FormMessage state={state} />
      <SubmitButton>เปลี่ยนรหัสผ่าน</SubmitButton>
    </form>
  );
}
