import Link from "next/link";
import { Icon } from "@/components/icons";
import { NoteToast } from "@/components/notes/note-dnd";
import { NoteFab } from "@/components/notes/note-fab";
import { FolderMenu } from "@/components/notes/note-menu";
import { NoteTree, RootDrop } from "@/components/notes/note-tree";
import { buildTree, type NoteNode, type NoteTreeNode } from "@/lib/notes";
import type { TeamRow } from "@/lib/teams";

/** "งานออกแบบ / สเปค" — ใช้เป็นชื่อโฟลเดอร์ในตัวเลือก */
export function folderOptions(nodes: NoteNode[], excludeIds: string[] = []): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (list: NoteTreeNode[], prefix: string) => {
    for (const n of list) {
      if (n.kind !== "FOLDER" || excludeIds.includes(n.id)) continue;
      out.push({ id: n.id, label: prefix + n.title });
      walk(n.children, `${prefix}${n.title} / `);
    }
  };
  walk(buildTree(nodes), "");
  return out;
}

/** โฟลเดอร์ใต้ parentId พร้อมโฟลเดอร์ย่อยทุกชั้น (count = จำนวนรายการข้างในชั้นแรก) — สำหรับ FolderRows */
export function folderItems(nodes: NoteNode[], parentId: string | null): { id: string; title: string; count: number; children: ReturnType<typeof folderItems> }[] {
  return nodes
    .filter((n) => n.kind === "FOLDER" && n.parentId === parentId)
    .map((f) => ({ id: f.id, title: f.title, count: nodes.filter((n) => n.parentId === f.id).length, children: folderItems(nodes, f.id) }));
}

/**
 * โครงหน้าโน้ต (แบบแอปโน้ตบนมือถือ)
 * จอใหญ่: แถบซ้าย = โฟลเดอร์และโน้ตทั้งหมด ลากวางเพื่อย้ายได้ · ขวา = เนื้อหา
 * มือถือ: ไม่มีแถบซ้าย — ไล่จากรายการโฟลเดอร์/โน้ตในหน้าเนื้อหาแทน
 * ปุ่มลอยมุมขวาล่าง: ค้นหา และ + สร้างใหม่
 */
export function NotesShell({
  team,
  nodes,
  activeId,
  openIds = [],
  canManageTeam,
  fab = true,
  q,
  children,
}: {
  team: TeamRow;
  nodes: NoteNode[];
  activeId?: string;
  /** โฟลเดอร์ที่ต้องกางไว้ (เส้นทางไปยังรายการที่เปิดอยู่) */
  openIds?: string[];
  canManageTeam: boolean;
  /** ซ่อนปุ่มลอย (เช่นตอนกำลังแก้โน้ต) */
  fab?: boolean;
  /** คำค้นปัจจุบัน */
  q?: string;
  children: React.ReactNode;
}) {
  const tree = buildTree(nodes);
  const noteCount = nodes.filter((n) => n.kind === "NOTE").length;
  const activeFolder = nodes.find((n) => n.id === activeId && n.kind === "FOLDER")?.id ?? nodes.find((n) => n.id === activeId)?.parentId ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <div className="rounded-2xl border border-border bg-surface p-2.5 shadow-soft">
          <p className="truncate px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{team.personalOfId ? "พื้นที่ส่วนตัว" : team.name}</p>
          <RootDrop href={`/notes?team=${team.id}&view=all`} active={!activeId} count={noteCount} />
          <Link href={`/notes/graph?team=${team.id}`} className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-foreground transition hover:bg-surface-sunken">
            <Icon name="link" className="h-4 w-4 text-primary" />
            แผนผังความสัมพันธ์
          </Link>
          {tree.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <NoteTree nodes={tree} activeId={activeId} openIds={openIds} />
            </div>
          )}
          <p className="mt-2 border-t border-border px-2 pb-1 pt-2.5 text-xs leading-5 text-muted-foreground">
            {tree.length > 0 && <>ลากไปวางบนโฟลเดอร์เพื่อย้าย · คลิกขวาที่โฟลเดอร์เพื่อสร้างโน้ตในนั้น · </>}
            {team.personalOfId ? (
              <>เห็นเฉพาะคุณ</>
            ) : (
              <>ทุกคนในทีมอ่านและแก้ได้{canManageTeam && <> · <Link href={`/teams/${team.id}`} className="font-medium text-primary hover:text-primary-strong">เชิญคน</Link></>}</>
            )}
          </p>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
      <NoteFab key={activeFolder ?? "root"} teamId={team.id} folders={folderOptions(nodes)} parentId={activeFolder} q={q} buttons={fab} />
      <FolderMenu />
      <NoteToast />
    </div>
  );
}
