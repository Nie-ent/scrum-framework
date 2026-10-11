"use client";

import { resetPassword } from "@/app/actions/auth";
import { NewPasswordFields } from "@/lib/schemas";
import { FormMessage, SubmitButton } from "@/components/form";
import { FieldError, useZodForm } from "@/components/zod-form";
import { useT } from "@/components/i18n";

export function ResetForm({ token }: { token: string }) {
  const tr = useT();
  const { state, pending, formProps, field, error } = useZodForm(NewPasswordFields, resetPassword);
  return (
    <form {...formProps} className="card space-y-5">
      <input type="hidden" name="token" value={token} />
      <div><p className="eyebrow">{tr("รหัสผ่าน")}</p><h2 className="text-xl font-semibold text-slate-950">{tr("ตั้งรหัสผ่านใหม่")}</h2></div>
      <div>
        <label className="label" htmlFor="next">{tr("รหัสผ่านใหม่")}{" "}<span className="font-normal text-slate-400">{tr("(อย่างน้อย 8 ตัวอักษร)")}</span></label>
        <input className="input" id="next" type="password" autoComplete="new-password" minLength={8} required {...field("next")} />
        <FieldError name="next" message={error("next")} />
      </div>
      <div>
        <label className="label" htmlFor="confirm">{tr("ยืนยันรหัสผ่านใหม่")}</label>
        <input className="input" id="confirm" type="password" autoComplete="new-password" minLength={8} required {...field("confirm")} />
        <FieldError name="confirm" message={error("confirm")} />
      </div>
      <FormMessage state={state} />
      <SubmitButton className="btn w-full" pending={pending}>{tr("บันทึกและเข้าสู่ระบบ")}</SubmitButton>
    </form>
  );
}
