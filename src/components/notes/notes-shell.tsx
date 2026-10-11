import Link from "next/link";
import { NoteToast } from "@/components/notes/note-dnd";
import { NoteFab } from "@/components/notes/note-fab";
import { NoteMenuHost } from "@/components/notes/note-menu";
import { FavoriteList, NoteTree, SideCreateButton, SideLinks } from "@/components/notes/note-tree";
import { requireUser } from "@/lib/auth";
import { buildTree, favoriteIds, type NoteNode, type NoteTreeNode } from "@/lib/notes";
import type { TeamRow } from "@/lib/teams";
import { tr } from "@/lib/i18n/server";

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
export async function NotesShell({
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
  const user = await requireUser();
  const favorites = await favoriteIds(user.id, team.id);
  const tree = buildTree(nodes);
  const noteCount = nodes.filter((n) => n.kind === "NOTE").length;
  const starred = nodes.filter((n) => favorites.includes(n.id));
  const activeFolder = nodes.find((n) => n.id === activeId && n.kind === "FOLDER")?.id ?? nodes.find((n) => n.id === activeId)?.parentId ?? null;
  const heading = "px-2 pb-1 pt-1 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle";
  return (
    <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="hidden lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
        <div className="rounded-2xl border border-border bg-surface p-2.5 shadow-soft">
          <div className="flex items-center justify-between gap-2 pb-1">
            <p className={`min-w-0 truncate ${heading}`}>{team.personalOfId ? tr("พื้นที่ส่วนตัว") : team.name}</p>
            <SideCreateButton />
          </div>
          <SideLinks teamId={team.id} count={noteCount} />
          {starred.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className={heading}>{tr("รายการโปรด")}</p>
              <FavoriteList items={starred} activeId={activeId} />
            </div>
          )}
          {tree.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <p className={heading}>{tr("ทั้งหมด")}</p>
              <NoteTree nodes={tree} activeId={activeId} openIds={openIds} favorites={favorites} />
            </div>
          )}
          <p className="mt-2 border-t border-border px-2 pb-1 pt-2.5 text-xs leading-5 text-muted-foreground">
            {tree.length > 0 && <>{tr("ลากไปวางบนโฟลเดอร์เพื่อย้าย · คลิกขวาเพื่อย้าย ลบ หรือเพิ่มในรายการโปรด ·")}{" "}</>}
            {team.personalOfId ? (
              <>{tr("เห็นเฉพาะคุณ")}</>
            ) : (
              <>{tr("ทุกคนในทีมอ่านและแก้ได้")}{canManageTeam && <> · <Link href={`/teams/${team.id}`} className="font-medium text-primary hover:text-primary-strong">{tr("เชิญคน")}</Link></>}</>
            )}
          </p>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
      <NoteFab key={activeFolder ?? "root"} teamId={team.id} folders={folderOptions(nodes)} parentId={activeFolder} q={q} buttons={fab} />
      <NoteMenuHost teamId={team.id} nodes={nodes} favorites={favorites} />
      <NoteToast />
    </div>
  );
}
