import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format-dates";
import { linkResolver, linkify, noteSnippet } from "@/lib/note-links";
import { favoriteIds, listNotes, pathTo } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { Icon } from "@/components/icons";
import { Markdown } from "@/components/notes/markdown";
import { NoteEditor } from "@/components/notes/note-editor";
import { ReadingSurface } from "@/components/notes/reading-surface";
import { ItemMenuButton } from "@/components/notes/note-menu";
import { FolderRows, NoteRows } from "@/components/notes/note-list";
import { NotesShell, folderItems } from "@/components/notes/notes-shell";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("โน้ต") };
}

/** อ่าน/แก้โน้ต หรือดูเนื้อหาของโฟลเดอร์ */
export default async function NotePage({ params, searchParams }: PageProps<"/notes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const editing = (await searchParams).edit === "1";

  const note = await prisma.note
    .findUnique({ where: { id }, include: { createdBy: { select: { name: true } }, updatedBy: { select: { name: true } } } })
    .catch(() => null);
  if (!note || note.deletedAt) notFound();
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  const team = teams.find((t) => t.id === note.teamId);
  // ไม่ได้อยู่ในทีมของโน้ตนี้ = ไม่บอกว่ามีโน้ตนี้อยู่
  if (!team) notFound();
  const canManage = manageableIds.has(team.id);

  const [nodes, outlinks, backlinks, taskLinks, tasks] = await Promise.all([
    listNotes(team.id),
    prisma.noteLink.findMany({ where: { fromId: note.id, toNote: { deletedAt: null } }, select: { toNote: { select: { id: true, title: true } } } }),
    prisma.noteLink.findMany({ where: { toNoteId: note.id, from: { deletedAt: null } }, select: { from: { select: { id: true, title: true } } }, orderBy: { from: { title: "asc" } } }),
    prisma.noteLink.findMany({ where: { fromId: note.id, toTaskId: { not: null } }, select: { toTask: { select: { number: true, title: true, progress: true, deletedAt: true } } } }),
    prisma.task.findMany({ where: { teamId: team.id, deletedAt: null, number: { not: null } }, select: { number: true, title: true, progress: true }, orderBy: { number: "desc" }, take: 300 }),
  ]);
  const path = pathTo(nodes, note.id);
  const crumbs = path.slice(0, -1);
  const shell = { team, nodes, activeId: note.id, openIds: path.map((p) => p.id), canManageTeam: canManage };
  const Breadcrumb = (
    <nav aria-label={tr("ตำแหน่ง")} className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
      <Link href={`/notes?team=${team.id}`} className="hover:text-indigo-700">{team.name}</Link>
      {crumbs.map((c) => (
        <span key={c.id} className="flex items-center gap-1"><span aria-hidden="true">/</span><Link href={`/notes/${c.id}`} className="hover:text-indigo-700">{c.title}</Link></span>
      ))}
    </nav>
  );

  if (note.kind === "FOLDER") {
    const children = nodes.filter((n) => n.parentId === note.id);
    const notes = await prisma.note.findMany({
      where: { parentId: note.id, kind: "NOTE", deletedAt: null },
      select: { id: true, title: true, content: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    });
    const favorites = await favoriteIds(user.id, team.id);
    const folders = folderItems(nodes, note.id).map((f) => ({ ...f, starred: favorites.includes(f.id) }));
    return (
      <NotesShell {...shell}>
        <div className="mx-auto max-w-3xl space-y-6">
          {Breadcrumb}
          <div className="page-header">
            <div>
              <h1 className="page-title flex items-center gap-2"><Icon name="folder" className="h-7 w-7 text-warning" />{note.title}</h1>
              <p className="page-subtitle">{children.length} {tr("รายการ")}</p>
            </div>
            <ItemMenuButton id={note.id} title={note.title} kind="FOLDER" />
          </div>
          {children.length === 0 ? (
            <p className="card text-sm text-muted-foreground">{tr("โฟลเดอร์นี้ยังว่าง — กดปุ่ม + มุมขวาล่างเพื่อสร้างโน้ตในโฟลเดอร์นี้ หรือลากโน้ตมาวาง")}</p>
          ) : (
            <>
              <FolderRows folders={folders} />
              <NoteRows notes={notes.map((n) => ({ id: n.id, title: n.title, when: formatDateTime(n.updatedAt), snippet: noteSnippet(n.content), starred: favorites.includes(n.id) }))} />
            </>
          )}
        </div>
      </NotesShell>
    );
  }

  const others = nodes.filter((n) => n.kind === "NOTE" && n.id !== note.id);
  if (editing) {
    return (
      <NotesShell {...shell} fab={false}>
        <div className="space-y-4">
          {Breadcrumb}
          <div className="card">
            <NoteEditor
              note={{ id: note.id, title: note.title, content: note.content, version: note.updatedAt.toISOString() }}
              noteTitles={[...new Set(others.map((n) => n.title))].sort((a, b) => a.localeCompare(b, "th"))}
              tasks={tasks.map((t) => ({ number: t.number!, title: t.title }))}
            />
          </div>
        </div>
      </NotesShell>
    );
  }

  // ลิงก์ในเนื้อหา: ชื่อโน้ต → โน้ตที่ชื่อตรง (ชื่อซ้ำเลือกตัวที่ใกล้โน้ตนี้ที่สุด), เลขงาน → งานของทีม
  const taskNumbers = new Set(tasks.map((t) => t.number));
  const rendered = linkify(note.content, {
    self: note.id,
    note: linkResolver(nodes, note),
    taskUrl: (number) => (taskNumbers.has(number) ? `/tasks?team=${team.id}&task=${number}` : undefined),
    newNoteUrl: (title) => `/notes/new?team=${team.id}&title=${encodeURIComponent(title)}${note.parentId ? `&parent=${note.parentId}` : ""}`,
  });
  // โน้ตที่เชื่อมกับโน้ตนี้ทั้งขาไป (เราอ้างถึง) และขากลับ (อ้างถึงเรา) — กดไปมาได้จากทั้งสองฝั่ง
  const related = new Map<string, { id: string; title: string; out: boolean; in: boolean }>();
  for (const l of outlinks) if (l.toNote) related.set(l.toNote.id, { ...l.toNote, out: true, in: false });
  for (const b of backlinks) related.set(b.from.id, { ...b.from, out: related.has(b.from.id), in: true });
  const relatedNotes = [...related.values()].sort((a, b) => a.title.localeCompare(b.title, "th"));
  const linkedTasks = taskLinks.flatMap((l) => (l.toTask && !l.toTask.deletedAt ? [l.toTask] : []));

  return (
    <NotesShell {...shell}>
      <div className="space-y-5">
        {Breadcrumb}
        <article className="card">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{note.title}</h1>
              <p className="mt-1 text-xs text-slate-500">
                {tr("แก้ล่าสุดโดย")}{" "}{note.updatedBy?.name ?? "—"} · {formatDateTime(note.updatedAt)}
                {note.createdBy && tr(" · สร้างโดย {0}", [note.createdBy.name])}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2"><Link href={`/notes/${note.id}?edit=1`} className="btn">{tr("แก้ไข")}</Link><ItemMenuButton id={note.id} title={note.title} kind="NOTE" /></div>
          </header>
          {note.content.trim() ? <ReadingSurface><Markdown content={rendered} /></ReadingSurface> : <p className="text-sm text-slate-400">{tr("โน้ตนี้ยังว่าง — กด แก้ไข เพื่อเริ่มเขียน")}</p>}
        </article>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="card">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900"><Icon name="link" className="h-4 w-4 text-indigo-600" />{tr("โน้ตที่เชื่อมกัน (")}{relatedNotes.length})</h2>
            {relatedNotes.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("ยังไม่มีโน้ตไหนลิงก์มา — เขียน")}{" "}<code className="rounded bg-slate-100 px-1">[[{note.title}]]</code> {tr("ในโน้ตอื่นเพื่อเชื่อมกัน")}</p>
            ) : (
              <ul className="space-y-1">
                {relatedNotes.map((r) => (
                  <li key={r.id}>
                    <Link href={`/notes/${r.id}`} className="flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-indigo-600 hover:text-indigo-800">
                      <Icon name="note" className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">{r.title}</span>
                      <span className="shrink-0 text-xs font-normal text-slate-500">{r.out && r.in ? tr("↔ เชื่อมหากัน") : r.out ? tr("→ โน้ตนี้อ้างถึง") : tr("← อ้างถึงโน้ตนี้")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{tr("งานที่โน้ตนี้อ้างถึง (")}{linkedTasks.length})</h2>
            {linkedTasks.length === 0 ? (
              <p className="text-sm text-slate-500">{tr("เขียน")}{" "}<code className="rounded bg-slate-100 px-1">{tr("#เลขงาน")}</code> {tr("ในเนื้อหาเพื่อเชื่อมกับงานของทีม")}</p>
            ) : (
              <ul className="space-y-1">
                {linkedTasks.map((t) => (
                  <li key={t.number}>
                    <Link href={`/tasks?team=${team.id}&task=${t.number}`} className="flex items-center gap-2 py-1 text-sm text-slate-700 hover:text-indigo-700">
                      <span className="tabular-nums text-slate-400">#{t.number}</span>
                      <span className={`min-w-0 flex-1 truncate ${t.progress >= 100 ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{t.progress}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

      </div>
    </NotesShell>
  );
}
