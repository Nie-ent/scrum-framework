"use client";

import { useActionState } from "react";
import { resendVerification } from "@/app/actions/auth";
import { setEmailNotifications } from "@/app/actions/notifications";
import { FormMessage, SubmitButton } from "@/components/form";
import { useT } from "@/components/i18n";

/** อีเมลแจ้งเตือน (งานใหม่ / ความคิดเห็น) — ส่งได้เมื่อยืนยันอีเมลแล้ว */
export function EmailSettings({ email, verified, enabled, canSend }: { email: string; verified: boolean; enabled: boolean; canSend: boolean }) {
  const tr = useT();
  const [state, action] = useActionState(setEmailNotifications, undefined);
  const [verifyState, verify] = useActionState(resendVerification, undefined);
  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{tr("อีเมลแจ้งเตือน")}</h2>
          <p className="text-sm text-slate-500">{tr("ส่งอีเมลถึง")}{" "}{email} {tr("เมื่อได้รับงานใหม่หรือมีคนแสดงความคิดเห็น")}</p>
        </div>
        <span className={`badge shrink-0 ${verified ? "badge-success" : "badge-warning"}`}>{verified ? tr("ยืนยันอีเมลแล้ว") : tr("ยังไม่ยืนยันอีเมล")}</span>
      </div>
      {!verified && (
        <form action={verify} className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="min-w-0 flex-1 basis-48">{tr("ยืนยันอีเมลก่อนจึงจะรับอีเมลแจ้งเตือนและกดรับคำเชิญในแอปได้")}</span>
          {canSend && <SubmitButton className="btn-ghost min-h-9 px-3 py-1 text-xs" pendingText={tr("กำลังส่ง...")}>{tr("ส่งลิงก์ยืนยัน")}</SubmitButton>}
          <span className="basis-full empty:hidden"><FormMessage state={verifyState} /></span>
        </form>
      )}
      <form action={action} className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 rounded border-slate-300 accent-indigo-600" />
          {tr("รับอีเมลแจ้งเตือน")}
        </label>
        <SubmitButton className="btn-ghost">{tr("บันทึก")}</SubmitButton>
        <span className="basis-full empty:hidden"><FormMessage state={state} /></span>
      </form>
    </section>
  );
}
