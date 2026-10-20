"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";

/**
 * รายละเอียดงานในแผงด้านข้าง: แสดงไม่เกิน 4 บรรทัด ยาวกว่านั้นกด "ดูเพิ่มเติม" เปิดหน้าต่างอ่านเต็ม ๆ
 * children = ข้อความที่แสดงผลแล้ว (ลิงก์ #งาน @คน กดได้) ใช้ทั้งในแผงและในหน้าต่าง
 */
export function TaskDescription({ title, children }: { title: string; children: React.ReactNode }) {
  const tr = useT();
  const box = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [clipped, setClipped] = useState(false);

  // ยาวเกิน 4 บรรทัดจริงไหม (วัดหลังแสดงผล — ข้อความสั้นไม่ต้องมีปุ่ม)
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={box} className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/85">{children}</div>
      {clipped && (
        <button type="button" onClick={() => dialog.current?.showModal()} className="mt-1 text-sm font-medium text-primary hover:text-primary-strong">
          {tr("ดูเพิ่มเติม")}
        </button>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="task-description-title"
        // กดพื้นหลังเพื่อปิด
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
        className="m-auto w-[min(42rem,calc(100vw-2rem))] max-h-[min(80vh,48rem)] overflow-hidden rounded-2xl border border-border bg-surface p-0 text-foreground shadow-overlay backdrop:bg-foreground/30"
      >
        <div className="flex max-h-[min(80vh,48rem)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="eyebrow">{tr("รายละเอียด")}</p>
              <h2 id="task-description-title" className="text-lg font-semibold leading-snug">{title}</h2>
            </div>
            <button type="button" onClick={() => dialog.current?.close()} aria-label={tr("ปิด")} className="btn-ghost min-h-9 shrink-0 px-2.5 py-1 text-sm">✕</button>
          </div>
          <div className="overflow-y-auto whitespace-pre-wrap break-words px-5 py-4 text-base leading-7 text-foreground">{children}</div>
        </div>
      </dialog>
    </>
  );
}
