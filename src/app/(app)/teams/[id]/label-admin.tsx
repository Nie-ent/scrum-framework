"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLabel, updateLabel } from "@/app/actions/tasks";
import { useT } from "@/components/i18n";
import { LABEL_COLOR_NAMES, labelClass } from "@/lib/labels";

type Label = { id: string; name: string; color: string; tasks: number };

/** จัดการป้ายกำกับงานของทีม (หัวหน้า/เจ้าของ): สร้าง เปลี่ยนชื่อ เปลี่ยนสี ลบ */
export function LabelAdmin({ teamId, labels }: { teamId: string; labels: Label[] }) {
  const tr = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setError(result.ok ? null : tr(result.error ?? "เกิดข้อผิดพลาด"));
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {labels.length > 0 && (
        <ul className="divide-y divide-border">
          {labels.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                defaultValue={l.name}
                maxLength={40}
                aria-label={tr("ชื่อป้าย {0}", [l.name])}
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== l.name && run(() => updateLabel(l.id, { name: e.target.value }))}
                className={`badge min-w-24 ring-1 ${labelClass(l.color)} border-0 outline-none focus:ring-2 focus:ring-primary`}
              />
              <span className="text-xs text-subtle">{tr("{0} งาน", [l.tasks])}</span>
              <span className="ml-auto flex gap-1" role="radiogroup" aria-label={tr("สีของป้าย {0}", [l.name])}>
                {LABEL_COLOR_NAMES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={l.color === c} aria-label={c} disabled={pending} onClick={() => run(() => updateLabel(l.id, { color: c }))} className={`h-5 w-5 rounded-full ring-1 ${labelClass(c)} ${l.color === c ? "ring-2 ring-primary" : ""}`} />
                ))}
              </span>
              <button type="button" disabled={pending} onClick={() => run(() => updateLabel(l.id, "delete"))} className="text-xs font-medium text-subtle hover:text-danger">{tr("ลบ")}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={tr("ชื่อป้ายใหม่")} aria-label={tr("ชื่อป้ายใหม่")} className="input h-9 min-h-0 flex-1 py-1 text-sm" />
        <button type="button" disabled={!name.trim() || pending} onClick={() => run(async () => { const r = await createLabel(teamId, name, "indigo"); if (r.ok) setName(""); return r; })} className="btn min-h-9 px-3 py-1 text-sm">{tr("สร้างป้าย")}</button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
