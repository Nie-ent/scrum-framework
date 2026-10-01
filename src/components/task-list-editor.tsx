"use client";

import { useEffect, useRef, type KeyboardEvent, type ClipboardEvent } from "react";
import type { Task } from "@/lib/tasks";

/**
 * รายการ task แบบพิมพ์ต่อเนื่อง: Enter = ขึ้น task ใหม่, Backspace ในบรรทัดว่าง = ลบ,
 * วางข้อความหลายบรรทัด = แยกเป็นหลาย task
 */
export function TaskListEditor({
  id,
  items,
  onChange,
  checkable = false,
  placeholder,
}: {
  id: string;
  items: Task[];
  onChange: (items: Task[]) => void;
  /** แสดง checkbox "เสร็จแล้ว" หน้าแต่ละ task */
  checkable?: boolean;
  placeholder?: string;
}) {
  const rows = items.length > 0 ? items : [{ text: "", done: checkable ? false : undefined }];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  // บรรทัดที่ต้อง focus หลังรายการเปลี่ยน (เพิ่ม/ลบ) — ทำหลัง render
  const pendingFocus = useRef<number | null>(null);

  const focusAt = (index: number) => {
    const el = inputs.current[index];
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  };

  useEffect(() => {
    if (pendingFocus.current === null) return;
    focusAt(pendingFocus.current);
    pendingFocus.current = null;
  });

  const newTask = (text = ""): Task => (checkable ? { text, done: false } : { text });
  const update = (index: number, patch: Partial<Task>) =>
    onChange(rows.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (!rows[index].text.trim()) return;
      pendingFocus.current = index + 1;
      onChange([...rows.slice(0, index + 1), newTask(), ...rows.slice(index + 1)]);
    } else if (e.key === "Backspace" && rows[index].text === "" && rows.length > 1) {
      e.preventDefault();
      pendingFocus.current = Math.max(0, index - 1);
      onChange(rows.filter((_, i) => i !== index));
    } else if (e.key === "ArrowUp" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === "ArrowDown" && index < rows.length - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>, index: number) {
    const lines = e.clipboardData
      .getData("text")
      .split(/\r?\n/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const merged = rows[index].text.trim() ? [rows[index], ...lines.map((l) => newTask(l))] : lines.map((l) => newTask(l));
    pendingFocus.current = index + merged.length - 1;
    onChange([...rows.slice(0, index), ...merged, ...rows.slice(index + 1)]);
  }

  return (
    <ul className="space-y-1.5" aria-labelledby={`${id}-label`}>
      {rows.map((task, index) => (
        <li key={index} className="group/task flex items-center gap-2">
          {checkable ? (
            <input
              type="checkbox"
              aria-label="ทำเสร็จแล้ว"
              checked={task.done === true}
              onChange={(e) => update(index, { done: e.target.checked })}
              className="h-4 w-4 shrink-0 accent-emerald-600"
            />
          ) : (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />
          )}
          <input
            ref={(el) => {
              inputs.current[index] = el;
            }}
            id={index === 0 ? id : undefined}
            value={task.text}
            onChange={(e) => update(index, { text: e.target.value })}
            onKeyDown={(e) => onKeyDown(e, index)}
            onPaste={(e) => onPaste(e, index)}
            placeholder={index === 0 ? placeholder : "task ถัดไป…"}
            maxLength={500}
            className={`input py-2 ${checkable && task.done ? "text-slate-400 line-through" : ""}`}
          />
          {rows.length > 1 && (
            <button
              type="button"
              aria-label="ลบ task"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="shrink-0 rounded-lg px-2 py-1 text-slate-300 opacity-0 transition hover:text-rose-600 focus:opacity-100 group-hover/task:opacity-100"
            >
              ×
            </button>
          )}
        </li>
      ))}
      <li className="pl-4 text-xs text-slate-400">กด Enter เพื่อเพิ่ม task · Backspace ในบรรทัดว่างเพื่อลบ</li>
    </ul>
  );
}

/** ส่งเฉพาะ task ที่มีข้อความ ไปกับ form ผ่าน hidden input */
export function serializeTasks(items: Task[]) {
  return JSON.stringify(items.filter((t) => t.text.trim()).map((t) => ({ ...t, text: t.text.trim() })));
}
