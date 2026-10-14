"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTaskBlocker, createLabel, createSubtask, removeTaskBlocker, setTaskLabels, setTaskParent } from "@/app/actions/tasks";
import { FormMessage, SubmitButton } from "@/components/form";
import { Select } from "@/components/select";
import { useT } from "@/components/i18n";
import { LABEL_COLOR_NAMES, labelClass, type LabelColor } from "@/lib/labels";

type Label = { id: string; name: string; color: string };
type TaskOption = { id: string; number: number | null; title: string };

/** เรียก action แล้วโหลดข้อมูลหน้าใหม่ — ข้อผิดพลาดแสดงใต้ส่วนนั้น */
function useRun() {
  const router = useRouter();
  const tr = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await fn();
      setError(result.ok ? null : tr(result.error ?? "เกิดข้อผิดพลาด"));
      router.refresh();
    });
  return { run, pending, error };
}

const ErrorText = ({ text }: { text: string | null }) => (text ? <p role="alert" className="mt-1 text-xs font-medium text-danger">{text}</p> : null);
const option = (t: TaskOption) => ({ value: t.id, label: `${t.number === null ? "" : `#${t.number} `}${t.title}` });

/** ป้ายของงาน: กดป้ายเพื่อติด/เอาออก · พิมพ์ชื่อใหม่เพื่อสร้าง */
export function LabelPicker({ taskId, teamId, labels, selected, canEdit }: { taskId: string; teamId: string; labels: Label[]; selected: string[]; canEdit: boolean }) {
  const tr = useT();
  const { run, pending, error } = useRun();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("indigo");
  const chosen = labels.filter((l) => selected.includes(l.id));
  const toggle = (id: string) => run(() => setTaskLabels(taskId, selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]));
  const create = () =>
    run(async () => {
      const made = await createLabel(teamId, name, color);
      if (!made.ok) return made;
      setName("");
      return setTaskLabels(taskId, [...new Set([...selected, made.label.id])]);
    });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {chosen.map((l) => <span key={l.id} className={`badge ring-1 ${labelClass(l.color)}`}>{l.name}</span>)}
        {chosen.length === 0 && !canEdit && <span className="text-subtle">{tr("ไม่มี")}</span>}
        {canEdit && (
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">
            {open ? tr("เสร็จ") : chosen.length ? tr("แก้ป้าย") : tr("+ ติดป้าย")}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-border bg-surface-sunken p-2.5">
          {labels.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr("ป้ายที่ใช้ได้")}>
              {labels.map((l) => (
                <button key={l.id} type="button" disabled={pending} aria-pressed={selected.includes(l.id)} onClick={() => toggle(l.id)} className={`badge ring-1 transition ${labelClass(l.color)} ${selected.includes(l.id) ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100"}`}>
                  {selected.includes(l.id) ? "✓ " : ""}{l.name}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (name.trim()) create(); } }} maxLength={40} placeholder={tr("ชื่อป้ายใหม่ เช่น Asset WS")} aria-label={tr("ชื่อป้ายใหม่")} className="input h-9 min-h-0 w-full py-1 text-sm" />
            <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1" role="radiogroup" aria-label={tr("สีป้าย")}>
              {LABEL_COLOR_NAMES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={`h-6 w-6 rounded-full ring-1 ${labelClass(c)} ${color === c ? "ring-2 ring-primary" : ""}`} />
              ))}
            </div>
            <button type="button" disabled={!name.trim() || pending} onClick={create} className="btn min-h-9 px-3 py-1 text-sm">{tr("สร้าง")}</button>
            </div>
          </div>
        </div>
      )}
      <ErrorText text={error} />
    </div>
  );
}

/** งานย่อย: รายการ (มาจากเซิร์ฟเวอร์) + ช่องเพิ่มงานย่อย */
export function AddSubtask({ parentId, members, selfId }: { parentId: string; members: { id: string; name: string }[] | null; selfId: string }) {
  const tr = useT();
  const [state, action] = useActionState(createSubtask, undefined);
  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name="parentId" value={parentId} />
      <div className="flex flex-wrap items-center gap-2">
        <input name="title" required maxLength={200} placeholder={tr("เพิ่มงานย่อย…")} aria-label={tr("ชื่องานย่อย")} className="input h-9 min-h-0 min-w-40 flex-1 py-1 text-sm" />
        {members && (
          <Select
            name="assigneeId"
            size="sm"
            className="w-36"
            placeholder={tr("ผู้รับงาน")}
            aria-label={tr("ผู้รับงานของงานย่อย")}
            options={[{ value: "", label: tr("เหมือนงานแม่") }, ...members.map((m) => ({ value: m.id, label: `${m.name}${m.id === selfId ? tr(" (ฉัน)") : ""}` }))]}
          />
        )}
        <SubmitButton className="btn-ghost min-h-9 px-3 py-1 text-sm" pendingText={tr("กำลังเพิ่ม...")}>{tr("เพิ่ม")}</SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

/** ย้ายงานนี้ไปเป็นงานย่อยของงานอื่น หรือเลิกเป็นงานย่อย */
export function ParentPicker({ taskId, parent, candidates }: { taskId: string; parent: TaskOption | null; candidates: TaskOption[] }) {
  const tr = useT();
  const { run, pending, error } = useRun();
  return (
    <div>
      {parent ? (
        <button type="button" disabled={pending} onClick={() => run(() => setTaskParent(taskId, null))} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("เลิกเป็นงานย่อย")}</button>
      ) : (
        candidates.length > 0 && (
          <Select size="sm" className="w-56" value="" placeholder={tr("ย้ายไปเป็นงานย่อยของ…")} aria-label={tr("ย้ายไปเป็นงานย่อยของ")} onChange={(id) => run(() => setTaskParent(taskId, id))} options={candidates.map(option)} />
        )
      )}
      <ErrorText text={error} />
    </div>
  );
}

/** งานที่ต้องรอ: เอาออกได้ และเพิ่มจากงานอื่นในทีม */
export function WaitingEditor({ taskId, blockers, candidates }: { taskId: string; blockers: TaskOption[]; candidates: TaskOption[] }) {
  const tr = useT();
  const { run, pending, error } = useRun();
  return (
    <div className="space-y-1.5">
      {blockers.map((b) => (
        <button key={b.id} type="button" disabled={pending} onClick={() => run(() => removeTaskBlocker(taskId, b.id))} aria-label={tr("ไม่ต้องรอ {0} แล้ว", [b.title])} className="text-xs font-medium text-subtle hover:text-danger">
          {tr("เอา {0} ออก", [b.number === null ? b.title : `#${b.number}`])}
        </button>
      ))}
      {candidates.length > 0 && <Select size="sm" className="w-56" value="" placeholder={tr("+ ต้องรองาน…")} aria-label={tr("เพิ่มงานที่ต้องรอ")} onChange={(id) => run(() => addTaskBlocker(taskId, id))} options={candidates.map(option)} />}
      <ErrorText text={error} />
    </div>
  );
}
