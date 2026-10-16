"use client";

import { useEffect, useRef, useState } from "react";
import * as P from "@radix-ui/react-popover";
import { useLocale, useT } from "@/components/i18n";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const utc = (key: string) => new Date(`${key}T00:00:00Z`);

/**
 * ตัวเลือกวันที่ของ Pace (แทน <input type="date"> ของเบราว์เซอร์ที่หน้าตาต่างกันทุกเครื่อง)
 * ส่งค่า YYYY-MM-DD เข้าฟอร์มผ่าน hidden input — ใช้ name ตรง ๆ หรือส่ง props จาก react-hook-form ผ่าน inputProps · ค่าว่าง = ไม่ได้เลือกวัน
 */
export function DatePicker({
  name,
  inputProps,
  defaultValue = "",
  today,
  min,
  id,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
  onChange,
}: {
  name?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
  defaultValue?: string;
  /** วันนี้ตามเขตเวลาของระบบ (YYYY-MM-DD) */
  today: string;
  /** เลือกวันก่อนหน้านี้ไม่ได้ */
  min?: string;
  id?: string;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
  /** เรียกเมื่อเลือกวัน ("" = ไม่กำหนดวัน) */
  onChange?: (value: string) => void;
}) {
  const tr = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const [month, setMonth] = useState((defaultValue || today).slice(0, 7));
  const input = useRef<HTMLInputElement | null>(null);
  const { ref: outerRef, ...rest } = inputProps ?? {};

  // ฟอร์มที่ถูก reset จะล้างค่าใน DOM — ให้ปุ่มแสดงตรงกับค่าจริง
  useEffect(() => {
    const form = input.current?.form;
    if (!form) return;
    const onReset = () => setValue("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  useEffect(() => {
    if (input.current && input.current.value !== value) input.current.value = value;
  });

  const choose = (next: string) => {
    setValue(next);
    if (input.current) input.current.value = next;
    setOpen(false);
    onChange?.(next);
  };

  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthIndex - 1, 1));
  const days = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const step = (by: number) => {
    const d = new Date(Date.UTC(year, monthIndex - 1 + by, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2023, 0, 1 + i))));
  const label = value ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(utc(value)) : tr("เลือกวัน");
  const nav = "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground";

  return (
    <P.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setMonth((value || (min && min > today ? min : today)).slice(0, 7));
        setOpen(next);
      }}
    >
      {(name || inputProps) && (
        <input
          type="hidden"
          name={name}
          {...rest}
          defaultValue={value}
          ref={(el) => {
            input.current = el;
            if (typeof outerRef === "function") outerRef(el);
          }}
        />
      )}
      <P.Trigger
        id={id}
        type="button"
        aria-label={ariaLabel ? `${ariaLabel}: ${label}` : undefined}
        aria-haspopup="dialog"
        className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white text-left text-slate-800 shadow-sm transition hover:border-slate-300 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/20 ${size === "sm" ? "min-h-9 px-2.5 text-sm" : "min-h-11 px-3 text-base sm:text-sm"} ${className || "w-full"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} className="size-4 shrink-0 text-subtle" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <span className={`min-w-0 flex-1 truncate ${value ? "" : "text-subtle"}`}>{label}</span>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12} className="tooltip-pop z-[90] w-[17.5rem] rounded-2xl border border-border bg-surface p-3 shadow-overlay">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => step(-1)} aria-label={tr("เดือนก่อนหน้า")} className={nav}>‹</button>
            <p className="text-sm font-semibold text-foreground" aria-live="polite">{new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</p>
            <button type="button" onClick={() => step(1)} aria-label={tr("เดือนถัดไป")} className={nav}>›</button>
          </div>
          <div className="grid grid-cols-7 text-center">
            {weekdays.map((w, i) => (
              <span key={i} className={`pb-1 text-2xs font-medium ${i === 0 || i === 6 ? "text-danger" : "text-subtle"}`}>{w}</span>
            ))}
            {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`pad-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const key = keyOf(year, monthIndex - 1, i + 1);
              const picked = key === value;
              const weekend = [0, 6].includes(utc(key).getUTCDay());
              return (
                <button
                  key={key}
                  type="button"
                  disabled={min !== undefined && key < min}
                  aria-pressed={picked}
                  aria-label={new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(utc(key))}
                  onClick={() => choose(key)}
                  className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums transition disabled:pointer-events-none disabled:opacity-30 ${picked ? "bg-primary font-semibold text-primary-foreground" : `hover:bg-surface-sunken ${key === today ? "font-semibold text-primary ring-1 ring-primary/40" : weekend ? "text-danger" : "text-foreground"}`}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
            <button type="button" onClick={() => choose(min && min > today ? min : today)} className="rounded-lg px-2 py-1 font-medium text-primary hover:bg-surface-sunken">{tr("วันนี้")}</button>
            <button type="button" onClick={() => choose("")} disabled={!value} className="rounded-lg px-2 py-1 font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground disabled:opacity-40">{tr("ไม่กำหนดวัน")}</button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
