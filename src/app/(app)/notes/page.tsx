import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format-dates";
import { noteSnippet } from "@/lib/note-links";
import { favoriteIds, listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { Icon } from "@/components/icons";
import { FolderRows, NoteRows, SystemRow, type FolderItem } from "@/components/notes/note-list";
import { NotesShell, folderItems } from "@/components/notes/notes-shell";
import { EmptyState } from "@/components/ui-state";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("โน้ต") };
}

/** หน้าแรกของโน้ต: โฟลเดอร์ + โน้ตทั้งหมด (แก้ล่าสุดขึ้นก่อน) หรือผลการค้นหา */
export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title={tr("คุณยังไม่ได้อยู่ในทีมไหน")} description={tr("โน้ตเป็นของทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน")} action={{ href: "/teams", label: tr("ไปหน้า ทีม") }} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  // หน้าแรกแสดงเฉพาะโฟลเดอร์ — รายการโน้ตจะเห็นเมื่อเข้าโฟลเดอร์ หรือเลือก "โน้ตทั้งหมด" / "ยังไม่อยู่ในโฟลเดอร์"
  const view = params.view === "all" || params.view === "loose" || params.view === "fav" ? params.view : null;
  const favorites = await favoriteIds(user.id, team.id);

  const [nodes, notes] = await Promise.all([
    listNotes(team.id),
    prisma.note.findMany({
      where: {
        teamId: team.id,
        kind: "NOTE",
        deletedAt: null,
        ...(view === "loose" ? { parentId: null } : {}),
        ...(view === "fav" ? { id: { in: favorites } } : {}),
      },
      select: { id: true, parentId: true, title: true, content: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: view ? 300 : 0,
    }),
  ]);
  const titleOf = new Map(nodes.map((n) => [n.id, n.title]));
  const noteCount = nodes.filter((n) => n.kind === "NOTE").length;
  const looseCount = nodes.filter((n) => n.kind === "NOTE" && !n.parentId).length;
  const star = (list: ReturnType<typeof folderItems>): FolderItem[] => list.map((f) => ({ ...f, starred: favorites.includes(f.id), children: star(f.children) }));
  const folders = star(folderItems(nodes, null));
  const home = `/notes?team=${team.id}`;
  const items = notes.map((n) => ({ id: n.id, title: n.title, when: formatDateTime(n.updatedAt), snippet: noteSnippet(n.content), folder: n.parentId ? titleOf.get(n.parentId) : undefined, starred: favorites.includes(n.id) }));
  const favoriteFolders = star(nodes.filter((n) => n.kind === "FOLDER" && favorites.includes(n.id)).map((f) => ({ id: f.id, title: f.title, count: nodes.filter((n) => n.parentId === f.id).length, children: [] })));

  return (
    <NotesShell team={team} nodes={nodes} canManageTeam={manageableIds.has(team.id)}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">{tr("โน้ต")}</h1>
            <p className="page-subtitle">{team.personalOfId ? tr("พื้นที่ส่วนตัว") : team.name} · {noteCount} {tr("โน้ต")}</p>
          </div>
          <Link href={`/notes/graph?team=${team.id}`} className="btn-ghost gap-1.5 lg:hidden"><Icon name="link" className="h-4 w-4 text-primary" />{tr("แผนผัง")}</Link>
        </div>

        {nodes.length === 0 ? (
          <div className="card space-y-3">
            <h2 className="font-semibold text-foreground">{tr("เริ่มจดโน้ตแรกของคุณ")}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
              <li>{tr("กดปุ่ม")}{" "}<b className="font-semibold text-foreground">+</b> {tr("มุมขวาล่าง เพื่อสร้างโน้ตหรือโฟลเดอร์")}</li>
              <li>{tr("ลากโน้ตไปวางบนโฟลเดอร์เพื่อจัดหมวดหมู่")}</li>
              <li>{tr("ในโน้ต พิมพ์")}{" "}<b className="font-semibold text-foreground">[[</b> {tr("เพื่อเชื่อมไปโน้ตอื่น หรือ")}{" "}<b className="font-semibold text-foreground">#</b> {tr("เพื่ออ้างถึงงาน")}</li>
            </ul>
          </div>
        ) : (
          view ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3 px-1">
                <h2 className="text-sm font-semibold text-muted-foreground">{view === "all" ? tr("โน้ตทั้งหมด") : view === "fav" ? tr("รายการโปรด") : tr("ยังไม่อยู่ในโฟลเดอร์")} ({items.length + (view === "fav" ? favoriteFolders.length : 0)})</h2>
                <Link href={home} className="text-sm font-medium text-primary hover:text-primary-strong">{tr("‹ โฟลเดอร์")}</Link>
              </div>
              {view === "fav" && <FolderRows folders={favoriteFolders} />}
              {items.length === 0 ? (view === "fav" && favoriteFolders.length > 0 ? null : <p className="card text-sm text-muted-foreground">{view === "fav" ? tr("ยังไม่มีรายการโปรด — คลิกขวาหรือกดค้างที่โน้ต แล้วเลือก เพิ่มในรายการโปรด") : tr("ยังไม่มีโน้ต — กดปุ่ม + มุมขวาล่างเพื่อสร้างโน้ตแรก")}</p>) : <NoteRows notes={items} />}
            </section>
          ) : (
            <section className="space-y-2.5">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">{tr("โฟลเดอร์")}</h2>
              <FolderRows folders={folders}>
                <SystemRow href={`${home}&view=all`} label={tr("โน้ตทั้งหมด")} count={noteCount} />
                {favorites.length > 0 && <SystemRow href={`${home}&view=fav`} label={tr("รายการโปรด")} count={favorites.length} />}
                {looseCount > 0 && <SystemRow href={`${home}&view=loose`} label={tr("ยังไม่อยู่ในโฟลเดอร์")} count={looseCount} />}
              </FolderRows>
            </section>
          )
        )}
      </div>
    </NotesShell>
  );
}
