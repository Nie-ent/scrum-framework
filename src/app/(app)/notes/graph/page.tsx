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

/** จำนวนกลุ่มที่ได้สีของตัวเอง (เท่าจำนวนสีในชุดสีของแผนผัง) — กลุ่มที่เล็กกว่านั้นใช้สีกลาง */
const COLORED_GROUPS = 8;

/**
 * แผนผังความสัมพันธ์ของโน้ต (และงานที่ถูกอ้างถึง) ของทีม — จัดวางด้วยแรงผลัก/ดึง โน้ตที่ถูกเชื่อมมากจุดใหญ่กว่า
 * โน้ตในโฟลเดอร์ระดับบนสุดเดียวกันเป็นกลุ่มเดียวกัน (เกาะกันและใช้สีเดียวกัน)
 */
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
  // กลุ่มของโน้ต = โฟลเดอร์ระดับบนสุดที่โน้ตอยู่ (โน้ตที่อยู่นอกโฟลเดอร์ไม่มีกลุ่ม)
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const topFolder = (id: string | null) => {
    let top: string | undefined;
    for (let f = id ? byId.get(id) : undefined, hops = 0; f && hops < 50; f = f.parentId ? byId.get(f.parentId) : undefined, hops++) top = f.id;
    return top;
  };
  const groupOf = new Map(notes.map((n) => [n.id, topFolder(n.parentId)]));
  const sizes = new Map<string, number>();
  for (const g of groupOf.values()) if (g) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  const byName = (a: string, b: string) => byId.get(a)!.title.localeCompare(byId.get(b)!.title, "th");
  // กลุ่มใหญ่ที่สุดได้สี โดยไล่สีตามชื่อ (สีจึงไม่สลับเมื่อจำนวนโน้ตเปลี่ยนเล็กน้อย)
  const colored = [...sizes.keys()].sort((a, b) => sizes.get(b)! - sizes.get(a)! || byName(a, b)).slice(0, COLORED_GROUPS).sort(byName);
  const groups = [...sizes.keys()].sort(byName).map((id) => ({ id, label: byId.get(id)!.title, slot: colored.includes(id) ? colored.indexOf(id) : null, count: sizes.get(id)! }));
  type Point = { id: string; label: string; href: string; kind: "note" | "task"; group?: string };
  const points: Point[] = [
    ...notes.map((n): Point => ({ id: n.id, label: n.title, href: `/notes/${n.id}`, kind: "note", group: groupOf.get(n.id) })),
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
            <ForceGraph points={points} edges={edges} groups={groups} />
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pb-1 pt-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground" />{tr("โน้ตที่มีความสัมพันธ์")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full border-2 border-muted-foreground" />{tr("โน้ตที่ยังไม่ถูกเชื่อม")}</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-neutral" />{tr("งาน")}</span>
              <span>{tr("สีและชื่อกลุ่ม = โฟลเดอร์หลัก · จุดที่อยู่ลึกจะเล็กและจางกว่า")}</span>
              <span>{tr("หัวลูกศรชี้ไปหาสิ่งที่ถูกอ้างถึง — สองหัวคือลิงก์หากันทั้งสองทาง")}</span>
              <span>{tr("ลากพื้นหลังเพื่อหมุน · กด Shift ค้างแล้วลาก (หรือใช้สองนิ้ว) เพื่อเลื่อน · หมุนล้อเมาส์เพื่อซูม · ลากจุดเพื่อจัดวาง · คลิกที่จุดเพื่อเปิด")}</span>
            </p>
          </div>
        )}
      </div>
    </NotesShell>
  );
}
