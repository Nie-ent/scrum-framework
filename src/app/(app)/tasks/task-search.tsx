"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n";

/** ช่องค้นหางาน: กรองรายการทันทีระหว่างพิมพ์ (คำค้นอยู่ใน ?q= จึงแชร์ลิงก์และกดย้อนกลับได้) */
export function TaskSearch({ base, q }: { /** ลิงก์ของหน้านี้ที่ยังไม่มีคำค้น */ base: string; q: string }) {
  const tr = useT();
  const router = useRouter();
  const [text, setText] = useState(q);
  // คำค้นที่ช่องนี้ส่งไปแล้วแต่หน้ายังโหลดไม่เสร็จ — ผลที่กลับมาช้ากว่าที่พิมพ์ต้องไม่เขียนทับสิ่งที่กำลังพิมพ์
  const [sent, setSent] = useState<string[]>([]);
  const [seen, setSeen] = useState(q);
  if (q !== seen) {
    setSeen(q);
    const at = sent.lastIndexOf(q);
    if (at >= 0) setSent(sent.slice(at + 1));
    // ไม่ใช่คำที่เราส่งเอง = ถูกเปลี่ยนจากที่อื่น (เช่นกด "ดูงานทั้งหมด") ช่องนี้จึงตามให้ตรง
    else setText(q);
  }
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const go = (value: string, wait: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const term = value.trim();
      setSent((list) => [...list.slice(-20), term]);
      router.replace(term ? `${base}&q=${encodeURIComponent(term)}` : base, { scroll: false });
    }, wait);
  };
  const change = (value: string) => {
    setText(value);
    go(value, 250);
  };

  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); go(text, 0); }} className="relative">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z" />
      </svg>
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        value={text}
        onChange={(e) => change(e.target.value)}
        maxLength={100}
        className="input py-2 pl-10 pr-16"
        placeholder={tr("ค้นหางาน: ชื่องาน เลขงาน หรือชื่อคน")}
        aria-label={tr("ค้นหางาน")}
      />
      {text && (
        <button type="button" onClick={() => change("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground">
          {tr("ล้าง")}
        </button>
      )}
    </form>
  );
}
