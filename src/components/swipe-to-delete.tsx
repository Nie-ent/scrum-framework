"use client";

import { useRef, useState, type PointerEvent } from "react";

/** ปัดไปทางขวาเกินระยะนี้ (สัดส่วนความกว้าง) แล้วปล่อย = ลบ */
const DELETE_THRESHOLD = 0.4;

/**
 * ปัดขวาเพื่อลบ — ใช้กับนิ้ว/ปากกาเท่านั้น (เมาส์ใช้ปุ่ม × แทน)
 * เริ่มนับเป็นการปัดเมื่อเลื่อนแนวนอนชัดเจน เลื่อนขึ้นลงยัง scroll หน้าได้ตามปกติ
 */
export function SwipeToDelete({
  onDelete,
  disabled = false,
  label = "ลบ",
  children,
}: {
  onDelete: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [width, setWidth] = useState(1);
  const start = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled || removing || e.pointerType === "mouse") return;
    start.current = { x: e.clientX, y: e.clientY };
    setWidth(box.current?.offsetWidth ?? 1);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    if (!dragging) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      // ต้องปัดไปทางขวาและแนวนอนชัดกว่าแนวตั้ง ไม่งั้นปล่อยให้ scroll
      if (dx <= 0 || Math.abs(dx) < Math.abs(dy) * 1.5) {
        start.current = null;
        return;
      }
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId); // ลากออกนอกแถวแล้วยังตามนิ้วอยู่
      } catch {
        // บาง browser จับ pointer ไม่ได้ — ยังปัดได้ตามปกติ
      }
    }
    setOffset(Math.max(0, dx));
  }

  function finish() {
    start.current = null;
    if (!dragging) return;
    setDragging(false);
    if (offset > width * DELETE_THRESHOLD) {
      setRemoving(true);
      setOffset(width);
      // รอให้แถวเลื่อนออกจนสุดก่อนค่อยลบ แล้วรีเซ็ต — รายการที่ใช้ index เป็น key
      // จะเอา component นี้ไปแสดงแถวถัดไป จึงต้องไม่ค้างสถานะ "ถูกปัดออก"
      window.setTimeout(async () => {
        try {
          await onDelete();
        } finally {
          setRemoving(false);
          setOffset(0);
        }
      }, 160);
    } else {
      setOffset(0);
    }
  }

  const armed = offset > width * DELETE_THRESHOLD;

  return (
    <div ref={box} className="relative overflow-hidden rounded-xl" style={{ touchAction: "pan-y" }}>
      <div
        aria-hidden="true"
        className={`absolute inset-0 flex items-center gap-1.5 pl-4 text-sm font-semibold text-white transition-colors ${
          armed || removing ? "bg-rose-600" : "bg-rose-400"
        } ${offset > 0 ? "" : "invisible"}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
        </svg>
        {armed || removing ? `ปล่อยเพื่อ${label}` : label}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        className="relative bg-white"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 160ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
