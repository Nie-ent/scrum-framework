"use client";

import { useEffect, useRef, type KeyboardEvent, type ClipboardEvent } from "react";
import { isDone, type Task } from "@/lib/tasks";
import { SwipeToDelete } from "./swipe-to-delete";

/**
 * รายการ task แบบพิมพ์ต่อเนื่อง: Enter = ขึ้น task ใหม่, Backspace ในบรรทัดว่าง = ลบ,
 * วางข้อความหลายบรรทัด = แยกเป็นหลาย task
 */
export function TaskListEditor({
  id,
  items,
  onChange,
  withProgress = false,
  placeholder,
}: {
  id: string;
  items: Task[];
  onChange: (items: Task[]) => void;
  /** แสดง checkbox "เสร็จแล้ว" และช่อง % ความคืบหน้าของแต่ละ task */
  withProgress?: boolean;
  placeholder?: string;
}) {
  const newTask = (text = ""): Task => (withProgress ? { text, progress: 0 } : { text });
  const rows = items.length > 0 ? items : [newTask()];
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
        <li key={index}>
          {/* มือถือ: ปัดขวาเพื่อลบบรรทัด (เมาส์ใช้ปุ่ม ×) — padding กันไม่ให้ขอบ focus ของช่องกรอกถูกตัด */}
          <SwipeToDelete
            label="ลบ task"
            disabled={!(rows.length > 1 || task.taskId)}
            onDelete={() => onChange(rows.filter((_, i) => i !== index))}
          >
          <div className="group/task flex items-center gap-1.5 p-1 sm:gap-2">
          {withProgress ? (
            <input
              type="checkbox"
              aria-label="ทำเสร็จแล้ว (100%)"
              checked={isDone(task)}
              onChange={(e) => update(index, { progress: e.target.checked ? 100 : 0 })}
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
            // งานที่คนอื่นมอบหมาย: ชื่อมาจากงานนั้น แก้ที่นี่ไม่ได้ (อัปเดตได้เฉพาะ %)
            readOnly={Boolean(task.taskId) && !task.editable}
            title={task.taskId && !task.editable ? "งานที่ได้รับมอบหมาย" : undefined}
            onChange={(e) => update(index, { text: e.target.value })}
            onKeyDown={(e) => onKeyDown(e, index)}
            onPaste={(e) => onPaste(e, index)}
            placeholder={index === 0 ? placeholder : "task ถัดไป…"}
            maxLength={500}
            enterKeyHint="next"
            className={`input py-2 ${withProgress && isDone(task) ? "text-slate-400 line-through" : ""} ${task.taskId && !task.editable ? "border-indigo-200 bg-indigo-50/50" : ""}`}
          />
          {withProgress && (
            <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={5}
                aria-label="ความคืบหน้า (%)"
                value={task.progress ?? 0}
                onChange={(e) => update(index, { progress: clampPercent(e.target.value) })}
                onFocus={(e) => e.target.select()}
                className={`input w-14 px-1.5 py-2 text-right tabular-nums sm:w-16 sm:px-2 ${isDone(task) ? "border-emerald-300 text-emerald-700" : ""}`}
              />
              %
            </label>
          )}
          {(rows.length > 1 || task.taskId) && (
            <button
              type="button"
              aria-label="ลบ task"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
              className="shrink-0 rounded-lg px-2 py-1 text-slate-400 transition hover:text-rose-600 focus:opacity-100 sm:text-slate-300 sm:opacity-0 sm:group-hover/task:opacity-100"
            >
              ×
            </button>
          )}
          </div>
          </SwipeToDelete>
        </li>
      ))}
      <li className="pl-4 text-xs text-slate-400">กด Enter เพื่อเพิ่ม task<span className="hidden sm:inline"> · Backspace ในบรรทัดว่างเพื่อลบ</span></li>
    </ul>
  );
}

function clampPercent(raw: string) {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

/** ส่งเฉพาะ task ที่มีข้อความ ไปกับ form ผ่าน hidden input */
export function serializeTasks(items: Task[]) {
  return JSON.stringify(
    items
      .filter((t) => t.text.trim())
      // editable ใช้ฝั่งฟอร์มเท่านั้น ไม่ส่งไปบันทึก
      .map((t) => ({ text: t.text.trim(), ...(t.progress === undefined ? {} : { progress: t.progress }), ...(t.taskId ? { taskId: t.taskId } : {}) })),
  );
}
