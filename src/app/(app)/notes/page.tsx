import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { Icon } from "@/components/icons";
import { NotesShell } from "@/components/notes/notes-shell";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "โน้ต" };

/** ภาพรวมโน้ตของทีม: โน้ตที่แก้ล่าสุด หรือผลการค้นหา */
export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title="คุณยังไม่ได้อยู่ในทีมไหน" description="โน้ตเป็นของทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน" action={{ href: "/teams", label: "ไปหน้า ทีม" }} />;
  }
  const team = teams.find((t) => t.id === params.team) ?? teams.find((t) => user.memberships.some((m) => m.teamId === t.id)) ?? teams[0];
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";

  const [nodes, notes, linkCount] = await Promise.all([
    listNotes(team.id),
    prisma.note.findMany({
      where: {
        teamId: team.id,
        kind: "NOTE",
        deletedAt: null,
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}),
      },
      select: { id: true, title: true, content: true, updatedAt: true, updatedBy: { select: { name: true } }, _count: { select: { linksIn: true, linksOut: true } } },
      orderBy: { updatedAt: "desc" },
      take: q ? 50 : 12,
    }),
    prisma.noteLink.count({ where: { from: { teamId: team.id, deletedAt: null } } }),
  ]);
  const snippet = (content: string) => {
    const plain = content.replace(/[#>*_`\[\]]/g, "").replace(/\s+/g, " ").trim();
    const at = q ? plain.toLowerCase().indexOf(q.toLowerCase()) : -1;
    const start = at > 60 ? at - 60 : 0;
    return (start > 0 ? "…" : "") + plain.slice(start, start + 160) + (plain.length > start + 160 ? "…" : "");
  };

  return (
    <NotesShell team={team} teams={teams} nodes={nodes} canManageTeam={manageableIds.has(team.id)}>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <p className="eyebrow">Knowledge base</p>
            <h1 className="page-title">โน้ต</h1>
            <p className="page-subtitle">
              {team.name} · {nodes.filter((n) => n.kind === "NOTE").length} โน้ต · {nodes.filter((n) => n.kind === "FOLDER").length} โฟลเดอร์ · {linkCount} ความสัมพันธ์
            </p>
          </div>
          <Link href={`/notes/graph?team=${team.id}`} className="btn-ghost gap-1.5"><Icon name="link" className="h-4 w-4 text-indigo-600" />แผนผังความสัมพันธ์</Link>
        </div>

        {nodes.length === 0 ? (
          <div className="card space-y-3">
            <h2 className="font-semibold text-slate-900">เริ่มฐานความรู้ของทีม</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-600">
              <li>สร้าง<b className="font-semibold text-slate-800">โฟลเดอร์</b>และ<b className="font-semibold text-slate-800">โน้ต</b>จากแถบด้านซ้าย เขียนด้วย Markdown</li>
              <li>เชื่อมโน้ตเข้าหากันด้วย <code className="rounded bg-slate-100 px-1">[[ชื่อโน้ต]]</code> — โน้ตปลายทางจะเห็นว่าใครลิงก์มา</li>
              <li>อ้างถึงงานของทีมด้วย <code className="rounded bg-slate-100 px-1">#เลขงาน</code> — โน้ตจะไปขึ้นใต้งานนั้นในหน้า งาน</li>
              <li>ทุกคนในทีมอ่านและแก้ได้ เชิญคนเพิ่มได้จากหน้าจัดการทีม</li>
            </ul>
          </div>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-900">{q ? `ผลการค้นหา "${q}" (${notes.length})` : "แก้ไขล่าสุด"}</h2>
              {q && <Link href={`/notes?team=${team.id}`} className="text-sm text-slate-500 hover:text-indigo-700">ล้างการค้นหา</Link>}
            </div>
            {notes.length === 0 ? (
              <p className="card text-sm text-slate-500">{q ? "ไม่พบโน้ตที่ตรงกับคำค้น" : "ยังไม่มีโน้ต มีแต่โฟลเดอร์ — สร้างโน้ตจากแถบด้านซ้าย"}</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {notes.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notes/${n.id}`} className="card flex h-full flex-col gap-2 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
                      <span className="flex items-center gap-2 font-semibold text-slate-900"><Icon name="note" className="h-4 w-4 text-slate-400" /><span className="min-w-0 truncate">{n.title}</span></span>
                      <span className="line-clamp-2 min-h-10 text-sm text-slate-500">{snippet(n.content) || "ยังไม่มีเนื้อหา"}</span>
                      <span className="mt-auto flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
                        <span>{n.updatedBy?.name ?? "—"} · {formatDateTime(n.updatedAt)}</span>
                        {n._count.linksIn + n._count.linksOut > 0 && <span className="inline-flex items-center gap-1"><Icon name="link" className="h-3.5 w-3.5" />{n._count.linksIn + n._count.linksOut}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </NotesShell>
  );
}
