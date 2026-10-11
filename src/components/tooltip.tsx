"use client";

import * as T from "@radix-ui/react-tooltip";
import * as P from "@radix-ui/react-popover";

/**
 * Tooltip เดียวของ Pace: ชื่อการกระทำ (+ คีย์ลัดถ้ามี) สำหรับปุ่มที่มีแต่ไอคอน หรือข้อความที่ถูกตัด
 * ขึ้นหลังชี้ ~0.4 วินาที และขึ้นทันทีเมื่อ focus ด้วยคีย์บอร์ด — ไม่ใช้เก็บข้อมูลที่หาที่อื่นไม่ได้
 * (จอสัมผัสไม่มีการชี้: ปุ่มต้องมี aria-label และคำอธิบายใช้ HelpTip แทน)
 */
export function Tooltip({
  label,
  shortcut,
  side = "top",
  children,
}: {
  label: React.ReactNode;
  shortcut?: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} collisionPadding={8} className="tooltip-pop z-[100] flex max-w-72 items-center gap-3 rounded-md bg-tooltip px-2.5 py-1.5 text-xs leading-snug text-tooltip-foreground shadow-raised">
          <span>{label}</span>
          {shortcut && <kbd className="font-sans text-2xs opacity-70">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <T.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

/** เครื่องหมาย "?" เล็ก ๆ อธิบายแนวคิดที่ไม่คุ้น — แตะหรือคลิกเพื่อเปิด ใช้ได้เหมือนกันบนมือถือ */
export function HelpTip({ title, children }: { title: string; children: string }) {
  return (
    <P.Root>
      <P.Trigger
        type="button"
        aria-label={`อธิบาย: ${title}`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full align-middle text-subtle transition hover:bg-surface-sunken hover:text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="size-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
        </svg>
      </P.Trigger>
      <P.Portal>
        <P.Content sideOffset={6} collisionPadding={12} className="tooltip-pop z-[100] w-64 rounded-lg bg-tooltip p-3 text-xs leading-relaxed text-tooltip-foreground shadow-raised">
          <p className="mb-1 font-semibold">{title}</p>
          <p className="opacity-90">{children}</p>
          <P.Arrow className="fill-tooltip" />
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
