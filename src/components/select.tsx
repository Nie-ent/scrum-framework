"use client";

import { useEffect, useRef, useState } from "react";
import * as P from "@radix-ui/react-popover";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * ตัวเลือกแบบ dropdown ของ Pace (แทน <select> ของเบราว์เซอร์ ให้หน้าตาเหมือนกันทุกเครื่อง)
 * ส่งค่าเข้าฟอร์มผ่าน hidden input — ใช้ name ตรง ๆ หรือส่ง props จาก react-hook-form ผ่าน inputProps
 * ไม่ส่ง value = เก็บค่าเอง (เริ่มจาก defaultValue) · ส่ง value="" พร้อม placeholder = ใช้เป็นเมนูคำสั่ง
 */
export function Select({
  options,
  name,
  inputProps,
  value: controlled,
  defaultValue = "",
  onChange,
  placeholder = "เลือก",
  className = "",
  size = "md",
  disabled,
  title,
  id,
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  name?: string;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> };
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
  id?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const selected = options.find((o) => o.value === value);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const { ref: outerRef, ...rest } = inputProps ?? {};

  // ฟอร์มที่ถูก reset จะล้างค่าใน DOM — เขียนค่าที่แสดงอยู่กลับเข้าไปเสมอ
  useEffect(() => {
    if (input.current && input.current.value !== value) input.current.value = value;
  });

  const choose = (next: string) => {
    setOpen(false);
    setOwn(next);
    if (input.current) input.current.value = next;
    onChange?.(next);
  };
  const move = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  };

  return (
    <P.Root open={open} onOpenChange={setOpen}>
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
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        className={`flex items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface text-left text-foreground shadow-soft transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-primary data-[state=open]:ring-2 data-[state=open]:ring-primary/20 ${size === "sm" ? "min-h-8 px-2.5 text-xs" : "min-h-11 px-3.5 text-[0.95rem]"} ${className || "w-full"}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-subtle"}`}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-subtle" aria-hidden="true">
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12} className="tooltip-pop z-[90] min-w-(--radix-popover-trigger-width) max-w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-surface p-1 shadow-overlay">
          <div ref={list} role="listbox" aria-label={ariaLabel} onKeyDown={move} className="max-h-[min(18rem,50vh)] overflow-y-auto">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                onClick={() => choose(o.value)}
                className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm transition hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none disabled:opacity-40 ${o.value === value ? "font-semibold text-primary" : "text-foreground"}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0" aria-hidden="true">
                    <path fillRule="evenodd" d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.89 7.47-9.81a.75.75 0 0 1 1.05-.15Z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            ))}
            {options.length === 0 && <p className="px-2.5 py-3 text-sm text-muted-foreground">ไม่มีตัวเลือก</p>}
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
