"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { deleteNote, moveNote, renameFolder, toggleFavorite } from "@/app/actions/notes";
import type { FormState } from "@/app/actions/auth";
import { Icon } from "@/components/icons";
import { Select } from "@/components/select";
import type { NoteNode } from "@/lib/notes";
import { noteToast } from "./note-dnd";

const OPEN = "pace-note-menu";
/** ส่งให้ NoteFab เปิดฟอร์มสร้าง — detail = โฟลเดอร์ที่จะสร้างข้างใน (null = โฟลเดอร์ที่เปิดอยู่) */
export const NEW_IN_FOLDER = "pace-note-new";
type Item = { id: string; title: string; kind: "FOLDER" | "NOTE" };
type Target = Item & { x: number; y: number };

export const openCreate = (folder: { id: string; title: string } | null) => window.dispatchEvent(new CustomEvent(NEW_IN_FOLDER, { detail: folder }));
const openMenu = (item: Item, x: number, y: number) => window.dispatchEvent(new CustomEvent<Target>(OPEN, { detail: { ...item, x, y } }));

/**
 * ทำให้แถวโน้ต/โฟลเดอร์เปิดเมนูได้ด้วยคลิกขวา (เมาส์) หรือกดค้าง (จอสัมผัส)
 * กดค้างแล้วปล่อยจะไม่ถือเป็นการกดเปิดรายการ
 */
export function useItemMenu(id: string, title: string, kind: Item["kind"]) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    style: { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } as React.CSSProperties,
    onContextMenu(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      openMenu({ id, title, kind }, e.clientX, e.clientY);
    },
    onTouchStart(e: React.TouchEvent) {
      const { clientX, clientY } = e.touches[0];
      held.current = false;
      cancel();
      timer.current = setTimeout(() => {
        held.current = true;
        openMenu({ id, title, kind }, clientX, clientY);
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

/** ปุ่ม ⋯ เปิดเมนูเดียวกับคลิกขวา — ใช้ในหัวหน้าโน้ต/โฟลเดอร์ */
export function ItemMenuButton({ id, title, kind }: Item) {
  return (
    <button
      type="button"
      aria-label={`ตัวเลือกของ ${title}`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        openMenu({ id, title, kind }, r.right - 240, r.bottom + 6);
      }}
      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-soft transition hover:bg-surface-sunken hover:text-foreground"
    >
      <Icon name="dots" className="h-5 w-5" />
    </button>
  );
}

const row = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition hover:bg-surface-sunken";
const glyph = "h-[1.15rem] w-[1.15rem] text-muted-foreground";

/**
 * เมนูของโน้ต/โฟลเดอร์ (มีตัวเดียวต่อหน้า) + หน้าต่างย้าย เปลี่ยนชื่อ และยืนยันการลบ
 * nodes = ทุกรายการของพื้นที่ (ใช้ทำตัวเลือกโฟลเดอร์ปลายทาง) · favorites = id ที่ติดดาวไว้
 */
export function NoteMenuHost({ teamId, nodes, favorites }: { teamId: string; nodes: NoteNode[]; favorites: string[] }) {
  const [menu, setMenu] = useState<Target | null>(null);
  const [dialog, setDialog] = useState<{ type: "move" | "rename" | "delete"; item: Item } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const show = (e: Event) => setMenu((e as CustomEvent<Target>).detail);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenu(null);
      setDialog(null);
    };
    window.addEventListener(OPEN, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN, show);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const run = (action: (state: FormState, data: FormData) => Promise<FormState>, fields: Record<string, string>, after?: () => void) =>
    start(async () => {
      const data = new FormData();
      for (const [k, v] of Object.entries(fields)) data.set(k, v);
      const result = await action(undefined, data);
      if (result?.error) {
        // หน้าต่างที่เปิดอยู่แสดงข้อผิดพลาดในตัว ไม่งั้นขึ้นเป็นข้อความลอย
        if (dialog) setError(result.error);
        else noteToast(result.error, true);
        return;
      }
      setDialog(null);
      if (result?.ok) noteToast(result.ok);
      after?.();
    });
  const ask = (type: "move" | "rename" | "delete", item: Item) => {
    setMenu(null);
    setError(null);
    setDialog({ type, item });
  };

  // โฟลเดอร์ปลายทางที่ย้ายไปได้: ไม่รวมตัวเองและลูกหลาน
  const destinations = (item: Item) => {
    const blocked = new Set([item.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const n of nodes) if (n.parentId && blocked.has(n.parentId) && !blocked.has(n.id)) grew = blocked.add(n.id).size > 0;
    }
    const label = (n: NoteNode): string => {
      const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : undefined;
      return parent ? `${label(parent)} / ${n.title}` : n.title;
    };
    return [{ value: "", label: "ระดับบนสุด" }, ...nodes.filter((n) => n.kind === "FOLDER" && !blocked.has(n.id)).map((n) => ({ value: n.id, label: label(n) })).sort((a, b) => a.label.localeCompare(b.label, "th"))];
  };

  const starred = menu ? favorites.includes(menu.id) : false;
  const left = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - 256)) : 0;
  const top = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - (menu.kind === "FOLDER" ? 330 : 290))) : 0;

  return (
    <>
      {menu &&
        createPortal(
          <div className="fixed inset-0 z-[85]" onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
            <button type="button" aria-label="ปิดเมนู" onClick={() => setMenu(null)} className="absolute inset-0 cursor-default" />
            <div role="menu" aria-label={menu.title} style={{ left, top }} className="tooltip-pop absolute w-60 rounded-2xl border border-border bg-surface p-1.5 shadow-overlay">
              <p className="truncate px-2.5 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{menu.title}</p>
              {menu.kind === "FOLDER" ? (
                <button type="button" role="menuitem" className={row} onClick={() => { setMenu(null); openCreate({ id: menu.id, title: menu.title }); }}>
                  <Icon name="note" className="h-[1.15rem] w-[1.15rem] text-primary" />สร้างโน้ตหรือโฟลเดอร์ในนี้
                </button>
              ) : (
                <Link role="menuitem" href={`/notes/${menu.id}?edit=1`} onClick={() => setMenu(null)} className={row}>
                  <Icon name="note" className="h-[1.15rem] w-[1.15rem] text-primary" />แก้ไข
                </Link>
              )}
              <Link role="menuitem" href={`/notes/${menu.id}`} onClick={() => setMenu(null)} className={row}>
                <Icon name="open" className={glyph} />เปิด
              </Link>
              <button type="button" role="menuitem" className={row} onClick={() => { const id = menu.id; setMenu(null); run(toggleFavorite, { id }); }}>
                <Icon name="star" filled={starred} className={`h-[1.15rem] w-[1.15rem] ${starred ? "text-warning" : "text-muted-foreground"}`} />{starred ? "เอาออกจากรายการโปรด" : "เพิ่มในรายการโปรด"}
              </button>
              {menu.kind === "FOLDER" && (
                <button type="button" role="menuitem" className={row} onClick={() => ask("rename", menu)}>
                  <Icon name="comment" className={glyph} />เปลี่ยนชื่อ
                </button>
              )}
              <button type="button" role="menuitem" className={row} onClick={() => ask("move", menu)}>
                <Icon name="folder" className={glyph} />ย้ายไป…
              </button>
              <button type="button" role="menuitem" className={`${row} mt-1 border-t border-border pt-1 text-danger`} onClick={() => ask("delete", menu)}>
                <Icon name="trash" className="h-[1.15rem] w-[1.15rem]" />ลบ
              </button>
            </div>
          </div>,
          document.body,
        )}
      {dialog &&
        createPortal(
          <div className="fixed inset-0 z-[80]">
            <button type="button" aria-label="ปิด" onClick={() => setDialog(null)} className="absolute inset-0 cursor-default bg-foreground/25" />
            <form
              role="dialog"
              aria-modal="true"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const { item } = dialog;
                if (dialog.type === "move") run(moveNote, { id: item.id, parentId: String(data.get("parentId") ?? "") });
                else if (dialog.type === "rename") run(renameFolder, { id: item.id, title: String(data.get("title") ?? "") });
                // ลบสิ่งที่กำลังเปิดอยู่ = กลับหน้าแรกของโน้ต
                else run(deleteNote, { id: item.id, stay: "1" }, () => pathname.includes(item.id) && router.push(`/notes?team=${teamId}`));
              }}
              className="tooltip-pop absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-overlay sm:top-24"
            >
              <p className="truncate text-sm font-semibold text-foreground">
                {dialog.type === "move" ? "ย้าย" : dialog.type === "rename" ? "เปลี่ยนชื่อ" : "ลบ"} &quot;{dialog.item.title}&quot;
              </p>
              {dialog.type === "move" && <Select name="parentId" aria-label="ย้ายไปโฟลเดอร์" defaultValue={nodes.find((n) => n.id === dialog.item.id)?.parentId ?? ""} options={destinations(dialog.item)} />}
              {dialog.type === "rename" && <input name="title" autoFocus required maxLength={120} defaultValue={dialog.item.title} aria-label="ชื่อโฟลเดอร์" className="input py-2" />}
              {dialog.type === "delete" && (
                <p className="text-sm leading-6 text-muted-foreground">
                  {dialog.item.kind === "FOLDER" ? "โฟลเดอร์นี้และทุกอย่างข้างในจะถูกลบ" : "โน้ตนี้จะถูกลบ"} และลิงก์ที่ชี้มาจะหายไป — ลบได้เฉพาะคนที่สร้าง หรือหัวหน้า/เจ้าของทีม
                </p>
              )}
              {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDialog(null)} className="btn-ghost min-h-10">ยกเลิก</button>
                <button disabled={pending} className={`btn min-h-10 ${dialog.type === "delete" ? "!bg-danger hover:brightness-95" : ""}`}>
                  {pending ? "กำลังทำ..." : dialog.type === "move" ? "ย้าย" : dialog.type === "rename" ? "บันทึก" : "ลบ"}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
