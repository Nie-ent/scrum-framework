"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";

const OPEN = "pace-folder-menu";
/** ส่งให้ปุ่มลอย (NoteFab) เปิดฟอร์มสร้าง โดยเลือกโฟลเดอร์นี้ไว้ให้ */
export const NEW_IN_FOLDER = "pace-note-new";
type Target = { id: string; title: string; x: number; y: number };

/**
 * ทำให้แถวโฟลเดอร์เปิดเมนูได้ด้วยคลิกขวา (เมาส์) หรือกดค้าง (จอสัมผัส)
 * กดค้างแล้วปล่อยจะไม่ถือเป็นการกดเปิดโฟลเดอร์
 */
export function useFolderMenu(id: string, title: string) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const open = (x: number, y: number) => window.dispatchEvent(new CustomEvent<Target>(OPEN, { detail: { id, title, x, y } }));
  return {
    style: { WebkitTouchCallout: "none" } as React.CSSProperties,
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      cancel();
      open(e.clientX, e.clientY);
    },
    onTouchStart(e: React.TouchEvent) {
      const { clientX, clientY } = e.touches[0];
      held.current = false;
      cancel();
      timer.current = setTimeout(() => {
        held.current = true;
        open(clientX, clientY);
      }, 500);
    },
    onTouchMove: cancel,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
    onClickCapture(e: React.MouseEvent) {
      if (!held.current) return;
      held.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

const item = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition hover:bg-surface-sunken";

/** เมนูของโฟลเดอร์ (มีตัวเดียวต่อหน้า) — ขึ้นตรงจุดที่คลิกขวา/กดค้าง */
export function FolderMenu() {
  const [target, setTarget] = useState<Target | null>(null);
  useEffect(() => {
    const show = (e: Event) => setTarget((e as CustomEvent<Target>).detail);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTarget(null);
    window.addEventListener(OPEN, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  if (!target) return null;
  const close = () => setTarget(null);
  const create = () => {
    close();
    window.dispatchEvent(new CustomEvent(NEW_IN_FOLDER, { detail: { id: target.id, title: target.title } }));
  };
  // ไม่ให้ล้นขอบจอ
  const left = Math.max(8, Math.min(target.x, window.innerWidth - 248));
  const top = Math.max(8, Math.min(target.y, window.innerHeight - 170));
  return createPortal(
    <div className="fixed inset-0 z-[85]" onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <button type="button" aria-label="ปิดเมนู" onClick={close} className="absolute inset-0 cursor-default" />
      <div role="menu" aria-label={`โฟลเดอร์ ${target.title}`} style={{ left, top }} className="tooltip-pop absolute w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-overlay">
        <p className="truncate px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{target.title}</p>
        <button type="button" role="menuitem" onClick={create} className={item}>
          <Icon name="note" className="h-[1.15rem] w-[1.15rem] text-primary" />
          สร้างโน้ตหรือโฟลเดอร์ในนี้
        </button>
        <Link href={`/notes/${target.id}`} role="menuitem" onClick={close} className={item}>
          <Icon name="folder" className="h-[1.15rem] w-[1.15rem] text-warning" />
          เปิดโฟลเดอร์
        </Link>
      </div>
    </div>,
    document.body,
  );
}
