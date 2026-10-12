"use client";

import { useActionState, useState } from "react";
import { createApiToken, revokeApiToken } from "@/app/actions/api-tokens";
import { FormMessage, SubmitButton } from "@/components/form";
import { useT } from "@/components/i18n";

type TokenRow = { id: string; name: string; readOnly: boolean; /** เชื่อมผ่านการกดอนุญาต (OAuth) ไม่ใช่โทเคนที่สร้างเอง */ oauth: boolean; created: string; lastUsed: string | null };

function CopyButton({ text, label }: { text: string; label: string }) {
  const tr = useT();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost min-h-9 shrink-0 px-3 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? tr("คัดลอกแล้ว ✓") : label}
    </button>
  );
}

/** เชื่อมผู้ช่วย AI เข้ากับ Pace ผ่าน MCP: สร้าง/ยกเลิกโทเคนส่วนตัว และวิธีตั้งค่า */
export function AiConnect({ endpoint, tokens }: { endpoint: string; tokens: TokenRow[] }) {
  const tr = useT();
  const [state, action] = useActionState(createApiToken, undefined);
  const token = state?.ok ? state.id : undefined;
  const command = `claude mcp add --transport http pace ${endpoint} --header "Authorization: Bearer ${token ?? tr("<โทเคนของคุณ>")}"`;
  return (
    <section className="card space-y-4" id="ai">
      <div>
        <h2 className="font-semibold text-slate-900">{tr("เชื่อมต่อผู้ช่วย AI (MCP)")}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {tr("ให้ผู้ช่วย AI ที่รองรับ MCP เช่น Claude ดูและจัดการงาน โน้ต และเช็กอินของคุณได้ — ผู้ช่วยทำได้เท่าที่บัญชีของคุณทำได้ และยกเลิกได้ทุกเมื่อ")}
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="label mb-0">{tr("ที่อยู่ของเซิร์ฟเวอร์")}</p>
        <p className="text-xs text-slate-500">{tr("โปรแกรมที่รองรับการเข้าสู่ระบบ (เช่น ตัวเชื่อมต่อแบบกำหนดเองของ claude.ai): ใส่ที่อยู่นี้อย่างเดียว แล้วกดอนุญาตในหน้าที่เปิดขึ้น ไม่ต้องใช้โทเคน")}</p>
        <div className="flex items-center gap-2">
          <input readOnly value={endpoint} aria-label={tr("ที่อยู่ของเซิร์ฟเวอร์")} className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <CopyButton text={endpoint} label={tr("คัดลอก")} />
        </div>
      </div>

      {tokens.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{t.name}{t.oauth && <span className="badge badge-neutral ml-2">{tr("เชื่อมผ่านการอนุญาต")}</span>}{t.readOnly && <span className="badge badge-neutral ml-2">{tr("อ่านอย่างเดียว")}</span>}</p>
                <p className="truncate text-xs text-slate-500">{tr("สร้าง {0}", [t.created])} · {t.lastUsed ? tr("ใช้ล่าสุด {0}", [t.lastUsed]) : tr("ยังไม่เคยใช้")}</p>
              </div>
              <form action={revokeApiToken} className="shrink-0">
                <input type="hidden" name="id" value={t.id} />
                <button className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-600" aria-label={tr("ยกเลิกโทเคน {0}", [t.name])}>{tr("ยกเลิก")}</button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <label className="label" htmlFor="token-name">{tr("ชื่อโทเคนใหม่")}</label>
            <input id="token-name" name="name" className="input" maxLength={60} required placeholder={tr("เช่น Claude บนโน้ตบุ๊ก")} />
          </div>
          <SubmitButton className="btn" pendingText={tr("กำลังสร้าง...")}>{tr("สร้างโทเคน")}</SubmitButton>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="readOnly" />
          {tr("อ่านอย่างเดียว — ผู้ช่วยดูข้อมูลได้ แต่สร้างหรือแก้ไขไม่ได้")}
        </label>
        <FormMessage state={state} />
      </form>

      {token && (
        <div className="space-y-2 rounded-xl bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">{tr("โทเคนของคุณ (แสดงครั้งเดียว — เก็บเป็นความลับเหมือนรหัสผ่าน)")}</p>
          <div className="flex items-center gap-2">
            <input readOnly value={token} aria-label={tr("โทเคน")} className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={token} label={tr("คัดลอก")} />
          </div>
        </div>
      )}

      <details className="text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-indigo-600">{tr("วิธีตั้งค่า")}</summary>
        <div className="mt-2 space-y-2 leading-6">
          <p>{tr("ในโปรแกรมผู้ช่วย AI ให้เพิ่มเซิร์ฟเวอร์ MCP แบบ HTTP ด้วยที่อยู่ด้านบน และใส่ส่วนหัว Authorization เป็น Bearer ตามด้วยโทเคน")}</p>
          <p>{tr("ตัวอย่างสำหรับ Claude Code:")}</p>
          <div className="flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-5 text-slate-100"><code>{command}</code></pre>
            <CopyButton text={command} label={tr("คัดลอก")} />
          </div>
          <p>{tr("จากนั้นลองถามผู้ช่วย เช่น \"งานค้างของฉันใน Pace มีอะไรบ้าง\" หรือ \"เพิ่มงาน เตรียมสไลด์ประชุม กำหนดส่งวันศุกร์\"")}</p>
        </div>
      </details>
    </section>
  );
}
