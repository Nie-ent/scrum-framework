"use client";

import { useState } from "react";
import * as P from "@radix-ui/react-popover";
import { useT } from "@/components/i18n";

type Member = { id: string; name: string };
type HiddenProps = React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };

/**
 * เลือกผู้รับงานแบบแท็กชื่อ (เหมือน ClickUp) — เลือกได้หลายคน ส่งไปเป็น id คั่นด้วย , ในช่อง assigneeId
 * หลายคน = งานแม่ + งานย่อยคนละงาน (ดู createGroupTaskFor)
 */
export function AssigneePicker({ id, members, selfId, defaultIds, inputProps }: { id?: string; members: Member[]; selfId: string; defaultIds: string[]; inputProps: HiddenProps }) {
  const tr = useT();
  const [ids, setIds] = useState(defaultIds);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const byId = new Map(members.map((m) => [m.id, m]));
  const label = (m: Member) => `${m.name}${m.id === selfId ? tr(" (ฉัน)") : ""}`;
  const term = q.trim().toLowerCase();
  const shown = members.filter((m) => !term || m.name.toLowerCase().includes(term));
  const toggle = (memberId: string) => setIds((cur) => (cur.includes(memberId) ? cur.filter((x) => x !== memberId) : [...cur, memberId]));

  return (
    <div>
      <input type="hidden" {...inputProps} value={ids.join(",")} />
      <P.Root open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQ(""); }}>
        <P.Anchor asChild>
          <div className="input flex min-h-11 flex-wrap items-center gap-1.5 py-1.5">
            {ids.map((memberId) => byId.get(memberId)).filter(Boolean).map((m) => (
              <span key={m!.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary-strong">
                <span className="truncate">{label(m!)}</span>
                <button type="button" onClick={() => toggle(m!.id)} aria-label={tr("เอา {0} ออก", [m!.name])} className="flex size-5 items-center justify-center rounded-full hover:bg-primary/15">×</button>
              </span>
            ))}
            <P.Trigger id={id} className="rounded-full px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary-soft">
              {ids.length === 0 ? tr("+ เลือกผู้รับงาน") : tr("+ เพิ่มคน")}
            </P.Trigger>
          </div>
        </P.Anchor>
        <P.Portal>
          <P.Content align="start" sideOffset={6} collisionPadding={16} className="tooltip-pop z-[80] w-[var(--radix-popover-trigger-width)] min-w-64 overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[0]) toggle(shown[0].id);
                  setQ("");
                }
              }}
              placeholder={tr("พิมพ์ชื่อ…")}
              aria-label={tr("ค้นหาสมาชิก")}
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none"
            />
            <ul role="listbox" aria-multiselectable="true" className="max-h-64 overflow-y-auto py-1">
              {shown.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{tr("ไม่พบสมาชิก")}</li>}
              {shown.map((m) => {
                const on = ids.includes(m.id);
                return (
                  <li key={m.id} role="option" aria-selected={on}>
                    <button type="button" onClick={() => toggle(m.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-sunken">
                      <span aria-hidden="true" className={`flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{on ? "✓" : ""}</span>
                      <span className="truncate">{label(m)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {ids.length > 1 && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{tr("{0} คน — แต่ละคนได้งานย่อยของตัวเองภายใต้งานนี้", [ids.length])}</p>}
          </P.Content>
        </P.Portal>
      </P.Root>
    </div>
  );
}
