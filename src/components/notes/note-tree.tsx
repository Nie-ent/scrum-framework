"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";
import { Tooltip } from "@/components/tooltip";
import type { NoteTreeNode } from "@/lib/notes";
import { dragProps, useDrop } from "./note-dnd";
import { openCreate, useItemMenu } from "./note-menu";
import { useT } from "@/components/i18n";

const row = "flex min-h-9 select-none items-center gap-1.5 rounded-lg px-2 text-sm transition";
const tone = (active: boolean) => (active ? "bg-primary-soft font-semibold text-primary" : "text-foreground hover:bg-surface-sunken");
const Star = () => <Icon name="star" filled className="h-3 w-3 text-warning" />;

function Folder({ node, activeId, openIds, favorites }: { node: NoteTreeNode; activeId?: string; openIds: string[]; favorites: string[] }) {
  const tr = useT();
  const [open, setOpen] = useState(openIds.includes(node.id) || node.children.length <= 8);
  const drop = useDrop(node.id);
  const menu = useItemMenu(node.id, node.title, "FOLDER");
  return (
    <li>
      <div {...dragProps(node.id, node.title)} {...drop.props} {...menu} className={`${row} ${drop.over ? "bg-primary-soft ring-2 ring-primary" : tone(node.id === activeId)} ${drop.pending ? "opacity-60" : ""}`}>
        <button type="button" aria-label={open ? tr("พับ {0}", [node.title]) : tr("กาง {0}", [node.title])} aria-expanded={open} onClick={() => setOpen(!open)} className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded text-subtle hover:text-foreground">
          <svg viewBox="0 0 20 20" fill="currentColor" className={`size-4 transition ${open ? "rotate-90" : ""}`} aria-hidden="true">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <Icon name="folder" className="h-4 w-4 text-warning" />
        <Link href={`/notes/${node.id}`} draggable={false} className="min-w-0 flex-1 truncate py-1.5">{node.title}</Link>
        {favorites.includes(node.id) && <Star />}
        <span className="shrink-0 text-xs tabular-nums text-subtle">{node.children.length}</span>
      </div>
      {open && node.children.length > 0 && (
        <div className="ml-3.5 border-l border-border pl-1.5">
          <NoteTree nodes={node.children} activeId={activeId} openIds={openIds} favorites={favorites} />
        </div>
      )}
    </li>
  );
}

function NoteLeaf({ node, active, starred, flat = false }: { node: { id: string; title: string; kind: "FOLDER" | "NOTE" }; active: boolean; starred: boolean; flat?: boolean }) {
  const menu = useItemMenu(node.id, node.title, node.kind);
  return (
    <li>
      <Link href={`/notes/${node.id}`} aria-current={active ? "page" : undefined} {...dragProps(node.id, node.title)} {...menu} className={`${row} ${flat ? "" : "pl-7"} ${tone(active)}`}>
        <Icon name={node.kind === "FOLDER" ? "folder" : "note"} className={`h-4 w-4 ${node.kind === "FOLDER" ? "text-warning" : "text-subtle"}`} />
        <span className="min-w-0 flex-1 truncate">{node.title}</span>
        {starred && <Star />}
      </Link>
    </li>
  );
}

/** ต้นไม้โฟลเดอร์/โน้ตในแถบซ้าย — ลากไปวางบนโฟลเดอร์เพื่อย้าย · คลิกขวาเพื่อดูตัวเลือก */
export function NoteTree({ nodes, activeId, openIds, favorites }: { nodes: NoteTreeNode[]; activeId?: string; openIds: string[]; favorites: string[] }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) =>
        n.kind === "FOLDER" ? <Folder key={n.id} node={n} activeId={activeId} openIds={openIds} favorites={favorites} /> : <NoteLeaf key={n.id} node={n} active={n.id === activeId} starred={favorites.includes(n.id)} />,
      )}
    </ul>
  );
}

/** รายการโปรดในแถบซ้าย (เรียงแบน ไม่มีชั้น) */
export function FavoriteList({ items, activeId }: { items: { id: string; title: string; kind: "FOLDER" | "NOTE" }[]; activeId?: string }) {
  return <ul className="space-y-0.5">{items.map((n) => <NoteLeaf key={n.id} node={n} active={n.id === activeId} starred flat />)}</ul>;
}

/** ลิงก์บนสุดของแถบซ้าย: โฟลเดอร์ทั้งหมด · โน้ตทั้งหมด (วางที่นี่ = ย้ายออกไประดับบนสุด) · แผนผัง — ไฮไลต์ตามหน้าที่เปิดอยู่จริง */
export function SideLinks({ teamId, count }: { teamId: string; count: number }) {
  const tr = useT();
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const drop = useDrop(null);
  const home = pathname === "/notes";
  return (
    <>
      <Link href={`/notes?team=${teamId}`} className={`${row} ${tone(home && !view)}`}>
        <Icon name="folder" className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 truncate">{tr("โฟลเดอร์")}</span>
      </Link>
      <Link href={`/notes?team=${teamId}&view=all`} draggable={false} {...drop.props} className={`${row} ${drop.over ? "bg-primary-soft ring-2 ring-primary" : tone(home && view === "all")} ${drop.pending ? "opacity-60" : ""}`}>
        <Icon name="note" className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 truncate">{tr("โน้ตทั้งหมด")}</span>
        <span className="shrink-0 text-xs tabular-nums text-subtle">{count}</span>
      </Link>
      <Link href={`/notes/graph?team=${teamId}`} className={`${row} ${tone(pathname === "/notes/graph")}`}>
        <Icon name="link" className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 truncate">{tr("แผนผังความสัมพันธ์")}</span>
      </Link>
    </>
  );
}

/** ปุ่ม + ที่หัวแถบซ้าย — เปิดฟอร์มสร้างโน้ต/โฟลเดอร์ (ในโฟลเดอร์ที่เปิดอยู่) */
export function SideCreateButton() {
  const tr = useT();
  return (
    <Tooltip label={tr("สร้างโน้ตหรือโฟลเดอร์")}>
      <button type="button" aria-label={tr("สร้างโน้ตหรือโฟลเดอร์")} onClick={() => openCreate(null)} className="flex size-7 shrink-0 items-center justify-center rounded-lg text-primary transition hover:bg-primary-soft">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-[1.15rem]" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
    </Tooltip>
  );
}
