"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Tooltip } from "@/components/tooltip";
import { NewItemForm } from "./note-forms";

/**
 * ปุ่มลอยมุมขวาล่างของหน้าโน้ต: ค้นหา และ + สร้างโน้ต/โฟลเดอร์
 * แบบฟอร์มจะขึ้นเมื่อกดปุ่มเท่านั้น และขึ้นที่ "ด้านบนของจอ" — แป้นพิมพ์มือถือเด้งจากด้านล่างจึงไม่บังช่องที่พิมพ์
 */
export function NoteFab({ teamId, folders, parentId, q = "" }: { teamId: string; folders: { id: string; label: string }[]; parentId: string | null; q?: string }) {
  const [sheet, setSheet] = useState<"search" | "add" | null>(null);
  const close = () => setSheet(null);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  return (
    <>
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-3 lg:bottom-8 lg:right-8">
        <Tooltip label="ค้นหาในโน้ต" side="top">
          <button type="button" aria-label="ค้นหาในโน้ต" onClick={() => setSheet("search")} className="flex size-12 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-raised transition hover:bg-surface-sunken">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z" />
            </svg>
          </button>
        </Tooltip>
        <Tooltip label="สร้างโน้ตหรือโฟลเดอร์" side="top">
          <button type="button" aria-label="สร้างโน้ตหรือโฟลเดอร์" onClick={() => setSheet("add")} className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition hover:bg-primary-strong">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </Tooltip>
      </div>
      {sheet &&
        createPortal(
          <div className="fixed inset-0 z-[80]">
            <button type="button" aria-label="ปิด" onClick={close} className="absolute inset-0 cursor-default bg-foreground/25" />
            <div role="dialog" aria-modal="true" aria-label={sheet === "search" ? "ค้นหาในโน้ต" : "สร้างใหม่"} className="tooltip-pop absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto max-w-md rounded-2xl border border-border bg-surface p-4 shadow-overlay sm:top-24">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{sheet === "search" ? "ค้นหาในโน้ต" : "สร้างใหม่"}</p>
                <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground">ปิด</button>
              </div>
              {sheet === "search" ? (
                <form action="/notes" onSubmit={close} className="flex gap-2">
                  <input type="hidden" name="team" value={teamId} />
                  <input name="q" type="search" autoFocus defaultValue={q} enterKeyHint="search" className="input py-2" placeholder="ค้นหาชื่อหรือเนื้อหา" aria-label="คำค้น" />
                  <button className="btn shrink-0 px-3.5">ค้นหา</button>
                </form>
              ) : (
                <NewItemForm teamId={teamId} folders={folders} parentId={parentId} autoFocus />
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
