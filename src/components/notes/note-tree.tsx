"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import type { NoteTreeNode } from "@/lib/notes";
import { dragProps, useDrop } from "./note-dnd";
import { useFolderMenu } from "./note-menu";

const row = "flex min-h-9 select-none items-center gap-1.5 rounded-lg px-2 text-sm transition";
const tone = (active: boolean) => (active ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-surface-sunken");

function Folder({ node, activeId, openIds }: { node: NoteTreeNode; activeId?: string; openIds: string[] }) {
  const [open, setOpen] = useState(openIds.includes(node.id) || node.children.length <= 8);
  const drop = useDrop(node.id);
  const menu = useFolderMenu(node.id, node.title);
  return (
    <li>
      <div {...dragProps(node.id, node.title)} {...drop.props} {...menu} className={`${row} ${drop.over ? "bg-primary-soft ring-2 ring-primary" : tone(node.id === activeId)} ${drop.pending ? "opacity-60" : ""}`}>
        <button type="button" aria-label={open ? `พับ ${node.title}` : `กาง ${node.title}`} aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded text-subtle hover:text-foreground">
          <svg viewBox="0 0 20 20" fill="currentColor" className={`size-4 transition ${open ? "rotate-90" : ""}`} aria-hidden="true">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <Icon name="folder" className="h-4 w-4 text-warning" />
        <Link href={`/notes/${node.id}`} draggable={false} className="min-w-0 flex-1 truncate py-1.5">{node.title}</Link>
        <span className="shrink-0 text-xs tabular-nums text-subtle">{node.children.length}</span>
      </div>
      {open && node.children.length > 0 && (
        <div className="ml-3.5 border-l border-border pl-1.5">
          <NoteTree nodes={node.children} activeId={activeId} openIds={openIds} />
        </div>
      )}
    </li>
  );
}

/** ต้นไม้โฟลเดอร์/โน้ตในแถบซ้าย — ลากโน้ตหรือโฟลเดอร์ไปวางบนโฟลเดอร์เพื่อย้าย */
export function NoteTree({ nodes, activeId, openIds }: { nodes: NoteTreeNode[]; activeId?: string; openIds: string[] }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) =>
        n.kind === "FOLDER" ? (
          <Folder key={n.id} node={n} activeId={activeId} openIds={openIds} />
        ) : (
          <li key={n.id}>
            <Link href={`/notes/${n.id}`} aria-current={n.id === activeId ? "page" : undefined} {...dragProps(n.id, n.title)} className={`${row} pl-7 ${tone(n.id === activeId)}`}>
              <Icon name="note" className="h-4 w-4 text-subtle" />
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

/** "โน้ตทั้งหมด" — วางที่นี่ = ย้ายออกไประดับบนสุด */
export function RootDrop({ href, active, count }: { href: string; active: boolean; count: number }) {
  const drop = useDrop(null);
  return (
    <Link href={href} draggable={false} {...drop.props} className={`${row} ${drop.over ? "bg-primary-soft ring-2 ring-primary" : tone(active)} ${drop.pending ? "opacity-60" : ""}`}>
      <Icon name="note" className="h-4 w-4 text-primary" />
      <span className="min-w-0 flex-1 truncate">โน้ตทั้งหมด</span>
      <span className="shrink-0 text-xs tabular-nums text-subtle">{count}</span>
    </Link>
  );
}
