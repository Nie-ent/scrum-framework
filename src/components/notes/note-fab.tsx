"use client";

import { useState } from "react";
import * as P from "@radix-ui/react-popover";
import { Tooltip } from "@/components/tooltip";
import { NewItemForm } from "./note-forms";

const sheet = "tooltip-pop z-[80] w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-4 shadow-overlay";

/**
 * ปุ่มลอยมุมขวาล่างของหน้าโน้ต: ค้นหา และ + สร้างโน้ต/โฟลเดอร์
 * แบบฟอร์มสร้างจะขึ้นเมื่อกด + เท่านั้น (ไม่ค้างอยู่บนหน้า)
 */
export function NoteFab({ teamId, folders, parentId, q = "" }: { teamId: string; folders: { id: string; label: string }[]; parentId: string | null; q?: string }) {
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  return (
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 flex items-center gap-3 lg:bottom-8 lg:right-8">
      <P.Root open={searching} onOpenChange={setSearching}>
        <Tooltip label="ค้นหาในโน้ต" side="top">
          <P.Trigger aria-label="ค้นหาในโน้ต" className="flex size-12 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-raised transition hover:bg-surface-sunken data-[state=open]:bg-surface-sunken">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z" />
            </svg>
          </P.Trigger>
        </Tooltip>
        <P.Portal>
          <P.Content side="top" align="end" sideOffset={12} collisionPadding={16} className={sheet}>
            <form action="/notes" onSubmit={() => setSearching(false)} className="flex gap-2">
              <input type="hidden" name="team" value={teamId} />
              <input name="q" type="search" autoFocus defaultValue={q} className="input py-2" placeholder="ค้นหาชื่อหรือเนื้อหา" aria-label="ค้นหาในโน้ต" />
              <button className="btn shrink-0 px-3.5">ค้นหา</button>
            </form>
          </P.Content>
        </P.Portal>
      </P.Root>
      <P.Root open={adding} onOpenChange={setAdding}>
        <Tooltip label="สร้างโน้ตหรือโฟลเดอร์" side="top">
          <P.Trigger aria-label="สร้างโน้ตหรือโฟลเดอร์" className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-overlay transition hover:bg-primary-strong">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`size-7 transition ${adding ? "rotate-45" : ""}`} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </P.Trigger>
        </Tooltip>
        <P.Portal>
          <P.Content side="top" align="end" sideOffset={12} collisionPadding={16} className={sheet}>
            <p className="mb-3 text-sm font-semibold text-foreground">สร้างใหม่</p>
            <NewItemForm teamId={teamId} folders={folders} parentId={parentId} autoFocus />
          </P.Content>
        </P.Portal>
      </P.Root>
    </div>
  );
}
