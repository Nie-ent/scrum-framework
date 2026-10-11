import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { noteSnippet } from "@/lib/note-links";
import { listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { Icon } from "@/components/icons";
import { FolderRows, NoteRows } from "@/components/notes/note-list";
import { NotesShell } from "@/components/notes/notes-shell";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "โน้ต" };

/** หน้าแรกของโน้ต: โฟลเดอร์ + โน้ตทั้งหมด (แก้ล่าสุดขึ้นก่อน) หรือผลการค้นหา */
export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title="คุณยังไม่ได้อยู่ในทีมไหน" description="โน้ตเป็นของทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน" action={{ href: "/teams", label: "ไปหน้า ทีม" }} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const [nodes, notes] = await Promise.all([
    listNotes(team.id),
    prisma.note.findMany({
      where: {
        teamId: team.id,
        kind: "NOTE",
        deletedAt: null,
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, parentId: true, title: true, content: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: q ? 50 : 200,
    }),
  ]);
  const titleOf = new Map(nodes.map((n) => [n.id, n.title]));
  const noteCount = nodes.filter((n) => n.kind === "NOTE").length;
  const folders = nodes.filter((n) => n.kind === "FOLDER" && !n.parentId).map((f) => ({ id: f.id, title: f.title, count: nodes.filter((n) => n.parentId === f.id).length }));
  const items = notes.map((n) => ({ id: n.id, title: n.title, when: formatDateTime(n.updatedAt), snippet: noteSnippet(n.content, q), folder: n.parentId ? titleOf.get(n.parentId) : undefined }));

  return (
    <NotesShell team={team} nodes={nodes} canManageTeam={manageableIds.has(team.id)} q={q}>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-title">โน้ต</h1>
            <p className="page-subtitle">{team.personalOfId ? "พื้นที่ส่วนตัว" : team.name} · {noteCount} โน้ต</p>
          </div>
          <Link href={`/notes/graph?team=${team.id}`} className="btn-ghost gap-1.5 lg:hidden"><Icon name="link" className="h-4 w-4 text-primary" />แผนผัง</Link>
        </div>

        {q ? (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-semibold text-muted-foreground">ผลการค้นหา &quot;{q}&quot; ({items.length})</h2>
              <Link href={`/notes?team=${team.id}`} className="text-sm font-medium text-primary hover:text-primary-strong">ล้างการค้นหา</Link>
            </div>
            {items.length === 0 ? <p className="card text-sm text-muted-foreground">ไม่พบโน้ตที่ตรงกับคำค้น</p> : <NoteRows notes={items} />}
          </section>
        ) : nodes.length === 0 ? (
          <div className="card space-y-3">
            <h2 className="font-semibold text-foreground">เริ่มจดโน้ตแรกของคุณ</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
              <li>กดปุ่ม <b className="font-semibold text-foreground">+</b> มุมขวาล่าง เพื่อสร้างโน้ตหรือโฟลเดอร์</li>
              <li>ลากโน้ตไปวางบนโฟลเดอร์เพื่อจัดหมวดหมู่</li>
              <li>ในโน้ต พิมพ์ <b className="font-semibold text-foreground">[[</b> เพื่อเชื่อมไปโน้ตอื่น หรือ <b className="font-semibold text-foreground">#</b> เพื่ออ้างถึงงาน</li>
            </ul>
          </div>
        ) : (
          <>
            {folders.length > 0 && (
              <section className="space-y-2.5">
                <h2 className="px-1 text-sm font-semibold text-muted-foreground">โฟลเดอร์</h2>
                <FolderRows folders={folders} />
              </section>
            )}
            <section className="space-y-2.5">
              <h2 className="px-1 text-sm font-semibold text-muted-foreground">โน้ตทั้งหมด</h2>
              {items.length === 0 ? <p className="card text-sm text-muted-foreground">ยังไม่มีโน้ต — กดปุ่ม + มุมขวาล่างเพื่อสร้างโน้ตแรก</p> : <NoteRows notes={items} />}
            </section>
          </>
        )}
      </div>
    </NotesShell>
  );
}
