"use client";

import { useState } from "react";
import { useT } from "@/components/i18n";

/**
 * พื้นที่อ่านโน้ต — บนจอสัมผัส การเลื่อนจอที่เริ่มด้วยการแตะค้างสั้น ๆ จะกลายเป็นการเลือกข้อความ
 * จึงปิดการเลือกข้อความไว้ก่อน (เลื่อนอ่านได้ลื่น) และมีปุ่มเปิดเมื่ออยากคัดลอก
 * จอที่ใช้เมาส์เลือกข้อความได้ตามปกติ ไม่มีปุ่มนี้
 */
export function ReadingSurface({ children }: { children: React.ReactNode }) {
  const tr = useT();
  const [selectable, setSelectable] = useState(false);
  return (
    <div>
      <div className="touch-reading" data-selectable={selectable || undefined}>{children}</div>
      <button
        type="button"
        aria-pressed={selectable}
        onClick={() => setSelectable(!selectable)}
        className="touch-only mt-4 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
      >
        {selectable ? tr("เสร็จแล้ว — กลับไปโหมดอ่าน") : tr("เลือกข้อความเพื่อคัดลอก")}
      </button>
    </div>
  );
}
