"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { dragProps, useDrop } from "./note-dnd";

export type FolderItem = { id: string; title: string; count: number };
export type NoteItem = { id: string; title: string; when: string; snippet: string; folder?: string };

const group = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft";
const Chevron = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-subtle" aria-hidden="true">
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
  </svg>
);

function FolderRow({ folder }: { folder: FolderItem }) {
  const drop = useDrop(folder.id);
  return (
    <li>
      <Link href={`/notes/${folder.id}`} {...dragProps(folder.id, folder.title)} {...drop.props} className={`flex min-h-12 items-center gap-3 px-4 transition ${drop.over ? "bg-primary-soft ring-2 ring-inset ring-primary" : "hover:bg-surface-sunken"} ${drop.pending ? "opacity-60" : ""}`}>
        <Icon name="folder" className="h-5 w-5 text-warning" />
        <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{folder.title}</span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{folder.count}</span>
        <Chevron />
      </Link>
    </li>
  );
}

/** รายการโฟลเดอร์แบบกลุ่มโค้งมน — ลากโน้ตมาวางบนโฟลเดอร์เพื่อย้าย */
export function FolderRows({ folders }: { folders: FolderItem[] }) {
  if (folders.length === 0) return null;
  return <ul className={group}>{folders.map((f) => <FolderRow key={f.id} folder={f} />)}</ul>;
}

/** รายการโน้ต: ชื่อ · เวลาที่แก้ล่าสุด · ข้อความขึ้นต้น */
export function NoteRows({ notes }: { notes: NoteItem[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className={group}>
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/notes/${n.id}`} {...dragProps(n.id, n.title)} className="block px-4 py-3 transition hover:bg-surface-sunken">
            <span className="block truncate text-[0.95rem] font-semibold text-foreground">{n.title}</span>
            <span className="mt-0.5 flex gap-2 text-sm text-muted-foreground">
              <span className="shrink-0 tabular-nums text-foreground/70">{n.when}</span>
              <span className="min-w-0 flex-1 truncate">{n.snippet || "ยังไม่มีเนื้อหา"}</span>
            </span>
            {n.folder && <span className="mt-1 flex items-center gap-1 text-xs text-subtle"><Icon name="folder" className="h-3.5 w-3.5" />{n.folder}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
