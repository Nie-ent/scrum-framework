"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { dragProps, useDrop } from "./note-dnd";
import { useItemMenu } from "./note-menu";
import { useT } from "@/components/i18n";

export type FolderItem = { id: string; title: string; count: number; children?: FolderItem[]; starred?: boolean };
export type NoteItem = { id: string; title: string; when: string; snippet: string; folder?: string; starred?: boolean };

const group = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft";
const Chevron = ({ className = "text-subtle" }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={`size-4 shrink-0 ${className}`} aria-hidden="true">
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
  </svg>
);

function FolderRow({ folder, depth }: { folder: FolderItem; depth: number }) {
  const tr = useT();
  const drop = useDrop(folder.id);
  const menu = useItemMenu(folder.id, folder.title, "FOLDER");
  const [open, setOpen] = useState(false);
  const subs = folder.children ?? [];
  return (
    <>
      <li {...dragProps(folder.id, folder.title)} {...drop.props} {...menu} className={`flex min-h-12 select-none items-center transition ${drop.over ? "bg-primary-soft ring-2 ring-inset ring-primary" : "hover:bg-surface-sunken"} ${drop.pending ? "opacity-60" : ""}`}>
        <Link href={`/notes/${folder.id}`} draggable={false} style={{ paddingLeft: `${1 + depth * 1.5}rem` }} className="flex min-h-12 min-w-0 flex-1 items-center gap-3">
          <Icon name="folder" className="h-5 w-5 text-warning" />
          <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{folder.title}</span>
          {folder.starred && <Icon name="star" filled className="h-3.5 w-3.5 text-warning" />}
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{folder.count}</span>
        </Link>
        {subs.length > 0 ? (
          // มีโฟลเดอร์ย่อย: ลูกศรกางดูโฟลเดอร์ย่อยตรงนี้ (กดชื่อ = เข้าโฟลเดอร์)
          <button type="button" aria-expanded={open} aria-label={open ? tr("พับโฟลเดอร์ย่อยของ {0}", [folder.title]) : tr("ดูโฟลเดอร์ย่อยของ {0}", [folder.title])} onClick={() => setOpen(!open)} className="flex size-12 shrink-0 items-center justify-center text-primary">
            <span className={`flex size-7 items-center justify-center rounded-full bg-primary-soft transition ${open ? "rotate-90" : ""}`}><Chevron className="text-primary" /></span>
          </button>
        ) : (
          <Link href={`/notes/${folder.id}`} draggable={false} tabIndex={-1} aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center"><Chevron /></Link>
        )}
      </li>
      {open && subs.map((f) => <FolderRow key={f.id} folder={f} depth={depth + 1} />)}
    </>
  );
}

/**
 * รายการโฟลเดอร์แบบกลุ่มโค้งมน — กดชื่อเพื่อเข้าโฟลเดอร์ · ลูกศรสีม่วง = มีโฟลเดอร์ย่อย กดเพื่อกางดู
 * ลากโน้ตมาวางบนโฟลเดอร์เพื่อย้าย · คลิกขวา/กดค้างเพื่อสร้างข้างใน
 */
export function FolderRows({ folders, children }: { folders: FolderItem[]; children?: React.ReactNode }) {
  if (folders.length === 0 && !children) return null;
  return <ul className={group}>{children}{folders.map((f) => <FolderRow key={f.id} folder={f} depth={0} />)}</ul>;
}

/** แถวพิเศษบนสุดของรายการโฟลเดอร์ เช่น "โน้ตทั้งหมด" */
export function SystemRow({ href, label, count, icon = "note" }: { href: string; label: string; count: number; icon?: "note" | "folder" }) {
  return (
    <li>
      <Link href={href} className="flex min-h-12 items-center gap-3 pl-4 transition hover:bg-surface-sunken">
        <Icon name={icon} className="h-5 w-5 text-primary" />
        <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{count}</span>
        <span className="flex size-12 shrink-0 items-center justify-center"><Chevron /></span>
      </Link>
    </li>
  );
}

function NoteRow({ note: n }: { note: NoteItem }) {
  const tr = useT();
  const menu = useItemMenu(n.id, n.title, "NOTE");
  return (
    <li>
      <Link href={`/notes/${n.id}`} {...dragProps(n.id, n.title)} {...menu} className="block select-none px-4 py-3 transition hover:bg-surface-sunken">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[0.95rem] font-semibold text-foreground">{n.title}</span>
          {n.starred && <Icon name="star" filled className="h-3.5 w-3.5 text-warning" />}
        </span>
        <span className="mt-0.5 flex gap-2 text-sm text-muted-foreground">
          <span className="shrink-0 tabular-nums text-foreground/70">{n.when}</span>
          <span className="min-w-0 flex-1 truncate">{n.snippet || tr("ยังไม่มีเนื้อหา")}</span>
        </span>
        {n.folder && <span className="mt-1 flex items-center gap-1 text-xs text-subtle"><Icon name="folder" className="h-3.5 w-3.5" />{n.folder}</span>}
      </Link>
    </li>
  );
}

/** รายการโน้ต: ชื่อ · เวลาที่แก้ล่าสุด · ข้อความขึ้นต้น — คลิกขวา/กดค้างเพื่อย้าย ลบ หรือติดดาว */
export function NoteRows({ notes }: { notes: NoteItem[] }) {
  if (notes.length === 0) return null;
  return <ul className={group}>{notes.map((n) => <NoteRow key={n.id} note={n} />)}</ul>;
}
