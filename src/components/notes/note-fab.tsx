"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@/components/tooltip";
import { NewItemForm } from "./note-forms";
import { NEW_IN_FOLDER } from "./note-menu";
import { useT } from "@/components/i18n";

/**
 * ปุ่มลอยมุมขวาล่างของหน้าโน้ต: + สร้างโน้ต/โฟลเดอร์ (การค้นหาอยู่ที่แถบคำสั่ง Cmd+K ซึ่งค้นได้ทุกอย่างจากทุกหน้า)
 * แบบฟอร์มจะขึ้นเมื่อกดปุ่มเท่านั้น และขึ้นที่ "ด้านบนของจอ" — แป้นพิมพ์มือถือเด้งจากด้านล่างจึงไม่บังช่องที่พิมพ์
 */
export function NoteFab({ teamId, folders, parentId, buttons = true }: { teamId: string; folders: { id: string; label: string }[]; parentId: string | null; /** false = ไม่แสดงปุ่มลอย (ยังเปิดฟอร์มจากเมนูโฟลเดอร์ได้) */ buttons?: boolean }) {
  const tr = useT();
  const [sheet, setSheet] = useState<"add" | null>(null);
  // โฟลเดอร์ที่เลือกจากเมนูคลิกขวา/กดค้าง — ไม่ได้เลือก = โฟลเดอร์ที่เปิดอยู่
  const [into, setInto] = useState<{ id: string; title: string } | null>(null);
  const close = () => setSheet(null);
  useEffect(() => {
    const open = (e: Event) => {
      setInto((e as CustomEvent<{ id: string; title: string } | null>).detail);
      setSheet("add");
    };
    window.addEventListener(NEW_IN_FOLDER, open);
    return () => window.removeEventListener(NEW_IN_FOLDER, open);
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <>
      {buttons && <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-3 lg:bottom-8 lg:right-8">
        <Tooltip label={tr("สร้างโน้ตหรือโฟลเดอร์")} side="top">
          <button type="button" aria-label={tr("สร้างโน้ตหรือโฟลเดอร์")} onClick={() => { setInto(null); setSheet("add"); }} className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition hover:bg-primary-strong">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </Tooltip>
      </div>}
      {sheet &&
        createPortal(
          <div className="fixed inset-0 z-[80]">
            <button type="button" aria-label={tr("ปิด")} onClick={close} className="absolute inset-0 cursor-default bg-foreground/25" />
            <div role="dialog" aria-modal="true" aria-label={tr("สร้างใหม่")} className="tooltip-pop absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-overlay sm:top-24">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-semibold text-foreground">{into ? tr("สร้างใน \"{0}\"", [into.title]) : tr("สร้างใหม่")}</p>
                <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground">{tr("ปิด")}</button>
              </div>
              <NewItemForm key={into?.id ?? "current"} teamId={teamId} folders={folders} parentId={into?.id ?? parentId} autoFocus />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
