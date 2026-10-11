"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as P from "@radix-ui/react-popover";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const pad = (n: number) => String(n).padStart(2, "0");
const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const shift = (key: string, days: number) => {
  const d = toDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return toKey(d);
};
const fmt = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("th-TH", { ...options, timeZone: "UTC" }).format(toDate(key));

const Chevron = ({ left = false }: { left?: boolean }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={`size-5 ${left ? "rotate-180" : ""}`} aria-hidden="true">
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
  </svg>
);
const arrow = "flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

/**
 * เลือกวันที่จะดู: ‹ วันที่ › — กดวันที่เพื่อเปิดปฏิทิน เลือกแล้วไปวันนั้นทันที (ไม่มีปุ่มยืนยัน)
 * query = พารามิเตอร์อื่นที่ต้องคงไว้ เช่น "team=…&view=grid"
 */
export function DateStepper({ dateKey, today, path, query = "" }: { dateKey: string; today: string; path: string; query?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // เดือนที่ปฏิทินกำลังแสดง (วันที่ 1 ของเดือน)
  const [month, setMonth] = useState(`${dateKey.slice(0, 7)}-01`);
  const go = (key: string) => {
    setOpen(false);
    if (key !== dateKey) router.push(`${path}?date=${key}${query ? `&${query}` : ""}`);
  };

  const first = toDate(month);
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const moveMonth = (delta: number) => setMonth(toKey(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1))));
  const nextMonthAllowed = month.slice(0, 7) < today.slice(0, 7);
  const isToday = dateKey === today;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex items-center rounded-full border border-border bg-surface p-0.5 shadow-soft">
        <button type="button" aria-label="วันก่อนหน้า" onClick={() => go(shift(dateKey, -1))} className={arrow}><Chevron left /></button>
        <P.Root
          open={open}
          onOpenChange={(next) => {
            if (next) setMonth(`${dateKey.slice(0, 7)}-01`);
            setOpen(next);
          }}
        >
          <P.Trigger aria-label={`วันที่ที่กำลังดู: ${fmt(dateKey, { dateStyle: "full" })} — กดเพื่อเลือกวัน`} className="flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-foreground transition hover:bg-surface-sunken data-[state=open]:bg-surface-sunken">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="size-[1.05rem] text-muted-foreground" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <span className="whitespace-nowrap tabular-nums">{isToday ? `วันนี้ · ${fmt(dateKey, { day: "numeric", month: "short" })}` : fmt(dateKey, { weekday: "short", day: "numeric", month: "short", year: "2-digit" })}</span>
          </P.Trigger>
          <P.Portal>
            <P.Content align="center" sideOffset={8} collisionPadding={12} className="tooltip-pop z-[80] w-[19rem] rounded-2xl border border-border bg-surface p-3 shadow-overlay">
              <div className="mb-2 flex items-center justify-between">
                <button type="button" aria-label="เดือนก่อนหน้า" onClick={() => moveMonth(-1)} className={arrow}><Chevron left /></button>
                <p className="text-sm font-semibold text-foreground">{fmt(month, { month: "long", year: "numeric" })}</p>
                <button type="button" aria-label="เดือนถัดไป" onClick={() => moveMonth(1)} disabled={!nextMonthAllowed} className={arrow}><Chevron /></button>
              </div>
              <div className="grid grid-cols-7 justify-items-center gap-y-0.5 text-center text-sm">
                {DAYS.map((d) => <span key={d} className="py-1 text-xs font-medium text-subtle">{d}</span>)}
                {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`b${i}`} />)}
                {Array.from({ length: lastDay }, (_, i) => {
                  const key = `${month.slice(0, 8)}${pad(i + 1)}`;
                  const selected = key === dateKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={key > today}
                      aria-current={selected ? "date" : undefined}
                      aria-label={fmt(key, { dateStyle: "long" })}
                      onClick={() => go(key)}
                      className={`flex size-9 items-center justify-center rounded-full tabular-nums transition disabled:pointer-events-none disabled:text-subtle disabled:opacity-40 ${selected ? "bg-primary font-semibold text-primary-foreground" : key === today ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-surface-sunken"}`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </P.Content>
          </P.Portal>
        </P.Root>
        <button type="button" aria-label="วันถัดไป" onClick={() => go(shift(dateKey, 1))} disabled={dateKey >= today} className={arrow}><Chevron /></button>
      </div>
      {/* จองที่ไว้เสมอ — ปุ่มโผล่ใต้ตัวเลือกวันโดยไม่ดันส่วนอื่นของหน้า */}
      <button type="button" onClick={() => go(today)} tabIndex={isToday ? -1 : 0} aria-hidden={isToday} className={`rounded-full px-3 py-1 text-sm font-medium text-primary transition hover:bg-primary-soft ${isToday ? "invisible" : ""}`}>
        กลับมาวันนี้
      </button>
    </div>
  );
}
