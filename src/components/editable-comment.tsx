"use client";

import { useState, useTransition } from "react";
import { editComment } from "@/app/actions/comments";
import { useT } from "@/components/i18n";

/**
 * ข้อความของความคิดเห็น + ปุ่ม "แก้ไข" (เฉพาะคนเขียน) — กดแล้วเป็นช่องแก้ในที่เดิม
 * รายการอัปเดต % / เปลี่ยนกำหนดส่ง แก้ได้แค่เหตุผล (entry) และเหตุผลว่างได้ยกเว้นตอนเลื่อนกำหนดส่ง
 */
export function EditableComment({
  id,
  body,
  canEdit,
  entry,
  edited,
  header,
  badge,
  actions,
  children,
}: {
  id: string;
  body: string;
  canEdit: boolean;
  entry: boolean;
  edited: boolean;
  /** ชื่อคนเขียนและเวลา */
  header: React.ReactNode;
  /** ป้ายรายการ (อัปเดต % / เปลี่ยนกำหนดส่ง) */
  badge?: React.ReactNode;
  /** ปุ่มอื่นในแถวเดียวกัน (เช่น ลบ) */
  actions?: React.ReactNode;
  /** ข้อความที่แสดงผลแล้ว (ลิงก์ #งาน @คน) */
  children: React.ReactNode;
}) {
  const tr = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const result = await editComment(id, text);
      if (!result.ok) return setError(tr(result.error));
      setError(null);
      setEditing(false);
    });

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
        {header}
        {edited && <span className="text-subtle">{tr("(แก้ไขแล้ว)")}</span>}
        {!editing && (canEdit || actions) && (
          <span className="ml-auto flex gap-3">
            {canEdit && (
              <button type="button" onClick={() => { setText(body); setEditing(true); }} className="text-subtle transition hover:text-primary">
                {entry && !body ? tr("เพิ่มเหตุผล") : tr("แก้ไข")}
              </button>
            )}
            {actions}
          </span>
        )}
      </div>
      {badge}
      {editing ? (
        <div className="mt-1 space-y-1.5">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
            }}
            rows={Math.min(8, Math.max(2, text.split("\n").length))}
            maxLength={2000}
            aria-label={tr("แก้ความคิดเห็น")}
            className="input w-full resize-y py-2 text-sm"
          />
          {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("ยกเลิก")}</button>
            <button type="button" disabled={pending || (!entry && !text.trim())} onClick={save} className="btn min-h-8 px-2.5 py-0.5 text-xs">{pending ? tr("กำลังบันทึก...") : tr("บันทึก")}</button>
          </div>
        </div>
      ) : (
        children
      )}
    </>
  );
}
