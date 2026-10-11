import Link from "next/link";
import { Icon } from "@/components/icons";
import { NewItemForm } from "@/components/notes/note-forms";
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

function Tree({ nodes, activeId, openIds }: { nodes: NoteTreeNode[]; activeId?: string; openIds: Set<string> }) {
  if (nodes.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) =>
        n.kind === "FOLDER" ? (
          <li key={n.id}>
            <details open={openIds.has(n.id) || n.children.length <= 8} className="group/folder">
              <summary className={`flex cursor-pointer list-none items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm marker:hidden hover:bg-slate-100 ${n.id === activeId ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700"}`}>
                <span aria-hidden="true" className="w-3 shrink-0 text-xs text-slate-400 transition group-open/folder:rotate-90">▸</span>
                <Icon name="folder" className="h-4 w-4 text-amber-500" />
                <Link href={`/notes/${n.id}`} className="min-w-0 flex-1 truncate">{n.title}</Link>
                <span className="shrink-0 text-xs text-slate-400">{n.children.length}</span>
              </summary>
              <div className="ml-3 border-l border-slate-200 pl-2">
                {n.children.length > 0 ? <Tree nodes={n.children} activeId={activeId} openIds={openIds} /> : <p className="px-2 py-1 text-xs text-slate-400">ว่าง</p>}
              </div>
            </details>
          </li>
        ) : (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              aria-current={n.id === activeId ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 pl-[1.375rem] text-sm transition hover:bg-slate-100 ${n.id === activeId ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700"}`}
            >
              <Icon name="note" className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * โครงหน้าโน้ต: แถบซ้าย = ทีม + ต้นไม้โฟลเดอร์/โน้ต + สร้างใหม่ · ขวา = เนื้อหา
 * บนมือถือ: หน้าอ่านโน้ตแสดงเนื้อหาก่อน (contentFirst)
 */
export function NotesShell({
  team,
  teams,
  nodes,
  activeId,
  openIds = [],
  canManageTeam,
  contentFirst = false,
  children,
}: {
  team: TeamRow;
  teams: TeamRow[];
  nodes: NoteNode[];
  activeId?: string;
  /** โฟลเดอร์ที่ต้องกางไว้ (เส้นทางไปยังรายการที่เปิดอยู่) */
  openIds?: string[];
  canManageTeam: boolean;
  /** มือถือ: แสดงเนื้อหาก่อนแถบต้นไม้ */
  contentFirst?: boolean;
  children: React.ReactNode;
}) {
  const tree = buildTree(nodes);
  const noteCount = nodes.filter((n) => n.kind === "NOTE").length;
  const activeFolder = nodes.find((n) => n.id === activeId && n.kind === "FOLDER")?.id ?? nodes.find((n) => n.id === activeId)?.parentId ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      {/* มือถือ: ตอนอ่านโน้ต เนื้อหาขึ้นก่อน แล้วต้นไม้อยู่ด้านล่าง */}
      <aside className={`lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto ${contentFirst ? "order-last lg:order-none" : ""}`}>
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="eyebrow block">Workspace</span>
              <span className="block truncate font-semibold text-slate-900">{team.name}</span>
            </span>
            <span className="badge badge-neutral shrink-0">{noteCount} โน้ต</span>
          </div>
          <div className="mt-3 space-y-4">
            {teams.length > 1 && (
              <nav aria-label="เลือกทีม" className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                {teams.map((t) => (
                  <Link key={t.id} href={`/notes?team=${t.id}`} aria-current={t.id === team.id ? "page" : undefined} className={`rounded-lg px-2.5 py-1 text-xs transition ${t.id === team.id ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}>
                    {t.name}
                  </Link>
                ))}
              </nav>
            )}
            <form action="/notes" className="flex gap-2">
              <input type="hidden" name="team" value={team.id} />
              <input name="q" type="search" className="input py-2" placeholder="ค้นหาในโน้ต" aria-label="ค้นหาในโน้ต" />
            </form>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <Link href={`/notes?team=${team.id}`} className="font-medium text-slate-500 hover:text-indigo-700">ภาพรวม</Link>
                <Link href={`/notes/graph?team=${team.id}`} className="font-medium text-slate-500 hover:text-indigo-700">แผนผังความสัมพันธ์</Link>
              </div>
              {tree.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">ยังไม่มีโน้ต — สร้างโน้ตแรกด้านล่าง</p> : <Tree nodes={tree} activeId={activeId} openIds={new Set(openIds)} />}
            </div>
            <div className="border-t border-slate-100 pt-3">
              <NewItemForm key={activeFolder ?? "root"} teamId={team.id} folders={folderOptions(nodes)} parentId={activeFolder} />
            </div>
            <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
              ทุกคนในทีม {team.name} อ่านและแก้โน้ตเหล่านี้ได้
              {canManageTeam && <> · <Link href={`/teams/${team.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">เชิญคนเข้าทีม</Link></>}
            </p>
          </div>
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
