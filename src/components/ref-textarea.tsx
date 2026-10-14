"use client";

import { useRef, useState } from "react";
import { refOptions } from "@/app/actions/refs";
import { useT } from "@/components/i18n";

type Options = NonNullable<Awaited<ReturnType<typeof refOptions>>>;
type Trigger = { kind: "person" | "task" | "note"; query: string; start: number };
type Item = { key: string; label: string; hint?: string; insert: string };

// ข้อมูลของแต่ละพื้นที่โหลดครั้งเดียวต่อการเปิดหน้า
const cache = new Map<string, Promise<Options | null>>();
const load = (teamId: string) => {
  if (!cache.has(teamId)) cache.set(teamId, refOptions(teamId).catch(() => null));
  return cache.get(teamId)!;
};

/** ข้อความก่อนเคอร์เซอร์บอกว่ากำลังพิมพ์ @ # หรือ [[ อยู่ไหม — มีหลายแบบในบรรทัด เลือกตัวที่ใกล้เคอร์เซอร์ที่สุด */
export function detect(text: string, caret: number): Trigger | null {
  const before = text.slice(Math.max(0, caret - 80), caret);
  const offset = caret - before.length;
  const found: Trigger[] = [];
  let m: RegExpExecArray | null;
  if ((m = /\[\[([^\[\]\n]{0,60})$/.exec(before))) found.push({ kind: "note", query: m[1], start: offset + m.index });
  // ชื่อคนมีช่องว่างได้ แต่ไม่มี # [ @ หรือขึ้นบรรทัดใหม่
  if ((m = /(?:^|[\s(])@([^\n@#\[]{0,30})$/.exec(before))) found.push({ kind: "person", query: m[1], start: offset + m.index + m[0].indexOf("@") });
  if ((m = /(?:^|[\s(])#([^\s#]{0,20})$/.exec(before))) found.push({ kind: "task", query: m[1], start: offset + m.index + m[0].indexOf("#") });
  return found.sort((a, b) => b.start - a.start)[0] ?? null;
}

function itemsFor(trigger: Trigger, options: Options): Item[] {
  const q = trigger.query.toLowerCase();
  if (trigger.kind === "person") {
    return options.people.filter((p) => p.name.toLowerCase().includes(q.trim()) || (q && p.name.toLowerCase().startsWith(q))).slice(0, 8).map((p) => ({ key: p.id, label: p.name, insert: `@${p.name} ` }));
  }
  if (trigger.kind === "task") {
    return options.tasks
      .filter((t) => !q || String(t.number).startsWith(q) || t.title.toLowerCase().includes(q))
      .sort((a, b) => Number(String(b.number) === q) - Number(String(a.number) === q))
      .slice(0, 8)
      .map((t) => ({ key: String(t.number), label: `#${t.number} ${t.title}`, hint: `${t.progress}%`, insert: `#${t.number} ` }));
  }
  return options.notes.filter((n) => n.title.toLowerCase().includes(q.trim())).slice(0, 8).map((n) => ({ key: n.id, label: n.title, insert: `[[${n.title}]] ` }));
}

/**
 * ช่องข้อความหลายบรรทัดที่พิมพ์ @ แท็กคน · # อ้างถึงงาน · [[ อ้างถึงโน้ต แล้วมีรายการให้เลือก
 * ใช้แทน <textarea> ได้เลย (ส่ง name / defaultValue / ref ของฟอร์มต่อได้ตามเดิม)
 * ↑ ↓ เลือก · Enter/Tab ใส่ · Esc ปิด — ตอนรายการไม่เปิด Enter ขึ้นบรรทัดใหม่ตามปกติ
 */
export function RefTextarea({ teamId, ref, onKeyDown, onInput, onBlur, ...props }: React.ComponentProps<"textarea"> & { teamId: string }) {
  const tr = useT();
  const own = useRef<HTMLTextAreaElement | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);
  // ช่องอยู่ล่างจอ = เปิดรายการขึ้นด้านบนแทน (ไม่ให้ตกขอบ)
  const [above, setAbove] = useState(false);
  const items = trigger && options ? itemsFor(trigger, options) : [];
  const open = items.length > 0;

  const refresh = (el: HTMLTextAreaElement) => {
    const next = el.selectionStart === el.selectionEnd ? detect(el.value, el.selectionStart) : null;
    setTrigger(next);
    setActive(0);
    if (next) setAbove(el.getBoundingClientRect().bottom > window.innerHeight - 260);
    if (next && !options) void load(teamId).then(setOptions);
  };

  const pick = (item: Item) => {
    const el = own.current;
    if (!el || !trigger) return;
    el.focus();
    el.setRangeText(item.insert, trigger.start, el.selectionStart, "end");
    // ให้ React / react-hook-form รู้ว่าค่าเปลี่ยน
    el.dispatchEvent(new Event("input", { bubbles: true }));
    setTrigger(null);
  };

  return (
    <div className="relative">
      <textarea
        {...props}
        ref={(el) => {
          own.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) ref.current = el;
        }}
        onInput={(e) => {
          refresh(e.currentTarget);
          onInput?.(e);
        }}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive((active + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              pick(items[Math.min(active, items.length - 1)]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setTrigger(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        onKeyUp={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") refresh(e.currentTarget);
        }}
        onBlur={(e) => {
          // ปล่อยให้คลิกรายการทันก่อนปิด
          setTimeout(() => setTrigger(null), 150);
          onBlur?.(e);
        }}
      />
      {open && (
        <div role="listbox" aria-label={tr(trigger!.kind === "person" ? "แท็กคน" : trigger!.kind === "task" ? "อ้างถึงงาน" : "อ้างถึงโน้ต")} className={`absolute left-0 z-50 ${above ? "bottom-full mb-1" : "top-full mt-1"} max-h-60 w-72 max-w-full overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-overlay`}>
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm ${i === active ? "bg-primary-soft text-primary-strong" : "text-foreground"}`}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              {item.hint && <span className="shrink-0 text-xs text-subtle">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
