import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { ForceGraph } from "@/components/notes/force-graph";
import { NotesShell } from "@/components/notes/notes-shell";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("แผนผังความสัมพันธ์") };
}

/** แผนผังความสัมพันธ์ของโน้ต (และงานที่ถูกอ้างถึง) ของทีม — จัดวางด้วยแรงผลัก/ดึง โน้ตที่ถูกเชื่อมมากจุดใหญ่กว่า */
export default async function NotesGraphPage({ searchParams }: PageProps<"/notes/graph">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  const team = (await pickSpace(teams, params.team))!;
  if (!team) notFound();

  const [nodes, links] = await Promise.all([
    listNotes(team.id),
    prisma.noteLink.findMany({
      where: { from: { teamId: team.id, deletedAt: null } },
      select: { fromId: true, toNoteId: true, toTask: { select: { id: true, number: true, title: true, deletedAt: true } } },
    }),
  ]);
  const notes = nodes.filter((n) => n.kind === "NOTE");
  const tasks = new Map(links.flatMap((l) => (l.toTask && !l.toTask.deletedAt ? [[l.toTask.id, l.toTask] as const] : [])));
  type Point = { id: string; label: string; href: string; kind: "note" | "task" };
  const points: Point[] = [
    ...notes.map((n): Point => ({ id: n.id, label: n.title, href: `/notes/${n.id}`, kind: "note" })),
    ...[...tasks.values()].map((t): Point => ({ id: t.id, label: `#${t.number} ${t.title}`, href: `/tasks?team=${team.id}&task=${t.number}`, kind: "task" })),
  ];
  const known = new Set(points.map((p) => p.id));
  const directed = links.flatMap((l) => {
    const to = l.toNoteId ?? (l.toTask && !l.toTask.deletedAt ? l.toTask.id : null);
    return to && known.has(to) ? [{ from: l.fromId, to }] : [];
  });
  // โน้ตสองอันที่ลิงก์หากันทั้งสองทาง = เส้นเดียวที่มีหัวลูกศรสองด้าน (ไม่วาดซ้อนกันจนดูเหมือนเส้นเดียว)
  const has = new Set(directed.map((e) => `${e.from}>${e.to}`));
  const edges = directed.flatMap((e) => {
    const both = has.has(`${e.to}>${e.from}`);
    return both && e.from > e.to ? [] : [{ ...e, both }];
  });
  return (
    <NotesShell team={team} nodes={nodes} canManageTeam={manageableIds.has(team.id)}>
      <div className="space-y-5">
        <div className="page-header">
          <div>
            <p className="eyebrow">{tr("ภาพรวมการเชื่อมโยง")}</p>
            <h1 className="page-title">{tr("แผนผังความสัมพันธ์")}</h1>
            <p className="page-subtitle">{team.name} · {notes.length} {tr("โน้ต ·")}{" "}{tasks.size} {tr("งานที่ถูกอ้างถึง ·")}{" "}{directed.length} {tr("เส้นเชื่อม")}</p>
          </div>
        </div>
        {points.length === 0 ? (
          <p className="card text-sm text-muted-foreground">{tr("ยังไม่มีโน้ต — สร้างโน้ตแล้วพิมพ์ [[ ในเนื้อหาเพื่อเชื่อมไปโน้ตอื่น แผนผังจะแสดงที่นี่")}</p>
        ) : (
          <div className="card p-2">
            <ForceGraph points={points} edges={edges} />
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-1 pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" />{tr("โน้ตที่มีความสัมพันธ์")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />{tr("งาน")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-subtle" />{tr("โน้ตที่ยังไม่ถูกเชื่อม")}</span>
              <span>{tr("หัวลูกศรชี้ไปหาสิ่งที่ถูกอ้างถึง — สองหัวคือลิงก์หากันทั้งสองทาง")}</span>
              <span>{tr("ลากจุดเพื่อจัดวาง · ลากพื้นหลังเพื่อเลื่อน · หมุนล้อเมาส์เพื่อซูม · คลิกที่จุดเพื่อเปิด")}</span>
            </p>
          </div>
        )}
      </div>
    </NotesShell>
  );
}
