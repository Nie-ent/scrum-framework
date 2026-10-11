import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { NewItemForm } from "@/components/notes/note-forms";
import { NotesShell, folderOptions } from "@/components/notes/notes-shell";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("สร้างโน้ต") };
}

/** มาจากการคลิกลิงก์ [[ชื่อ]] ที่ยังไม่มีโน้ต — ยืนยันแล้วสร้างโน้ตชื่อนั้น */
export default async function NewNotePage({ searchParams }: PageProps<"/notes/new">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  const team = teams.find((t) => t.id === params.team);
  if (!team) notFound();
  const nodes = await listNotes(team.id);
  const title = typeof params.title === "string" ? params.title.slice(0, 120) : "";
  const parent = typeof params.parent === "string" && nodes.some((n) => n.id === params.parent && n.kind === "FOLDER") ? params.parent : null;

  return (
    <NotesShell team={team} nodes={nodes} canManageTeam={manageableIds.has(team.id)}>
      <div className="card max-w-xl space-y-4">
        <div>
          <p className="eyebrow">{tr("โน้ตใหม่")}</p>
          <h1 className="text-xl font-semibold text-slate-950">{tr("ยังไม่มีโน้ต \"")}{title}&quot;</h1>
          <p className="mt-1 text-sm text-slate-500">{tr("สร้างโน้ตนี้เลยไหม? โน้ตที่เขียน [[")}{title}{tr("]] ไว้จะเชื่อมมาที่โน้ตใหม่ทันที")}</p>
        </div>
        <NewItemForm teamId={team.id} folders={folderOptions(nodes)} parentId={parent} title={title} />
        <Link href={`/notes?team=${team.id}`} className="inline-block text-sm text-slate-500 hover:text-indigo-700">{tr("← กลับไปหน้าโน้ต")}</Link>
      </div>
    </NotesShell>
  );
}
