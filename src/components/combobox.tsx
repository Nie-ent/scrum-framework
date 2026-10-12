"use client";

import { useId, useRef, useState } from "react";
import * as P from "@radix-ui/react-popover";

export type ComboOption = { value: string; hint?: string };

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "list"> & { ref?: React.Ref<HTMLInputElement> };

/**
 * ช่องพิมพ์ที่มีรายการแนะนำของ Pace (แทน <datalist> ของเบราว์เซอร์ที่หน้าตาต่างกันทุกเครื่อง)
 * พิมพ์อะไรก็ได้ — รายการเป็นแค่ตัวช่วย เลือกแล้วค่าจะถูกใส่ในช่องเหมือนพิมพ์เอง (ใช้กับ react-hook-form ได้ตรง ๆ)
 */
export function Combobox({ options, ref: outerRef, onChange, onFocus, onKeyDown, ...props }: InputProps & { options: ComboOption[] }) {
  const input = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(String(props.defaultValue ?? props.value ?? ""));
  const [active, setActive] = useState(-1);

  const term = text.trim().toLowerCase();
  const shown = options
    .filter((o) => o.value.toLowerCase() !== term && (!term || o.value.toLowerCase().includes(term) || o.hint?.toLowerCase().includes(term)))
    .slice(0, 8);
  const visible = open && shown.length > 0;

  const choose = (value: string) => {
    const el = input.current;
    if (!el) return;
    // ใส่ค่าแบบเดียวกับการพิมพ์ ให้ React และ react-hook-form เห็นการเปลี่ยนแปลง
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    setOpen(false);
    el.focus();
  };

  return (
    <P.Root open={visible} onOpenChange={setOpen}>
      <P.Anchor asChild>
        <input
          {...props}
          ref={(el) => {
            input.current = el;
            if (typeof outerRef === "function") outerRef(el);
            else if (outerRef) outerRef.current = el;
          }}
          role="combobox"
          aria-expanded={visible}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
            onChange?.(e);
          }}
          onFocus={(e) => {
            // ฟอร์มที่ถูก reset จะล้างค่าใน DOM โดยไม่ยิง event — อ่านค่าจริงทุกครั้งที่เข้าช่อง
            setText(e.target.value);
            setOpen(true);
            onFocus?.(e);
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (!visible) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((at) => (at + (e.key === "ArrowDown" ? 1 : -1) + shown.length + (at < 0 && e.key === "ArrowUp" ? 1 : 0)) % shown.length);
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(shown[active].value);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </P.Anchor>
      <P.Portal>
        <P.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.target === input.current && e.preventDefault()}
          className="tooltip-pop z-[90] w-(--radix-popover-trigger-width) min-w-48 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface p-1 shadow-overlay"
        >
          <div id={listId} role="listbox" className="max-h-[min(16rem,45vh)] overflow-y-auto">
            {shown.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                // mousedown ไม่ย้าย focus ออกจากช่อง (ไม่งั้นช่องจะ blur ก่อนได้เลือก)
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o.value)}
                className={`flex min-h-10 w-full flex-col justify-center rounded-lg px-2.5 py-1 text-left text-sm text-foreground transition hover:bg-surface-sunken ${i === active ? "bg-surface-sunken" : ""}`}
              >
                <span className="w-full truncate">{o.value}</span>
                {o.hint && <span className="w-full truncate text-xs text-muted-foreground">{o.hint}</span>}
              </button>
            ))}
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
