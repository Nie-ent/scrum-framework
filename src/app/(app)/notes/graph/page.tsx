import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listNotes } from "@/lib/notes";
import { getWorkspaceTeams } from "@/lib/teams";
import { NotesShell } from "@/components/notes/notes-shell";

export const metadata: Metadata = { title: "แผนผังความสัมพันธ์" };

const SIZE = 720;
const CENTER = SIZE / 2;

/** แผนผังความสัมพันธ์ของโน้ต (และงานที่ถูกอ้างถึง) ของทีม — วางเป็นวงกลม โน้ตที่ถูกเชื่อมมากจุดใหญ่กว่า */
export default async function NotesGraphPage({ searchParams }: PageProps<"/notes/graph">) {
  const user = await requireUser();
  const params = await searchParams;
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  const team = teams.find((t) => t.id === params.team) ?? teams.find((t) => user.memberships.some((m) => m.teamId === t.id)) ?? teams[0];
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
    ...[...tasks.values()].map((t): Point => ({ id: t.id, label: `#${t.number} ${t.title}`, href: `/tasks?team=${team.id}#task-${t.number}`, kind: "task" })),
  ];
  const edges = links.flatMap((l) => {
    const to = l.toNoteId ?? (l.toTask && !l.toTask.deletedAt ? l.toTask.id : null);
    return to && points.some((p) => p.id === to) ? [{ from: l.fromId, to }] : [];
  });
  const degree = new Map<string, number>();
  for (const e of edges) for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);

  // จุดที่มีความสัมพันธ์อยู่วงใน จุดโดดเดี่ยวอยู่วงนอก — เรียงตามจำนวนเส้นเพื่อให้จุดสำคัญกระจายตัว
  const connected = points.filter((p) => degree.has(p.id)).sort((a, b) => degree.get(b.id)! - degree.get(a.id)!);
  const isolated = points.filter((p) => !degree.has(p.id));
  const place = (list: Point[], radius: number) =>
    list.map((p, i) => {
      const angle = (2 * Math.PI * i) / Math.max(list.length, 1) - Math.PI / 2;
      return { ...p, x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
    });
  const placed = [...place(connected, connected.length === 1 ? 0 : 190), ...place(isolated, 310)];
  const at = new Map(placed.map((p) => [p.id, p]));
  const short = (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label);

  return (
    <NotesShell team={team} teams={teams} nodes={nodes} canManageTeam={manageableIds.has(team.id)} contentFirst>
      <div className="space-y-5">
        <div className="page-header">
          <div>
            <p className="eyebrow">ภาพรวมการเชื่อมโยง</p>
            <h1 className="page-title">แผนผังความสัมพันธ์</h1>
            <p className="page-subtitle">{team.name} · {notes.length} โน้ต · {tasks.size} งานที่ถูกอ้างถึง · {edges.length} เส้นเชื่อม</p>
          </div>
        </div>
        {points.length === 0 ? (
          <p className="card text-sm text-slate-500">ยังไม่มีโน้ต — สร้างโน้ตแล้วเชื่อมกันด้วย [[ชื่อโน้ต]] แผนผังจะแสดงที่นี่</p>
        ) : (
          <div className="card overflow-x-auto p-2">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`แผนผังความสัมพันธ์ของโน้ตในทีม ${team.name}`} className="mx-auto h-auto w-full min-w-[520px] max-w-3xl">
              <g stroke="#c7d2fe" strokeWidth={1.2}>
                {edges.map((e, i) => {
                  const a = at.get(e.from);
                  const b = at.get(e.to);
                  return a && b ? <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
                })}
              </g>
              {placed.map((p) => {
                const r = 6 + Math.min(10, (degree.get(p.id) ?? 0) * 2);
                const right = p.x >= CENTER;
                return (
                  <Link key={p.id} href={p.href}>
                    <title>{p.label}</title>
                    <circle cx={p.x} cy={p.y} r={r} fill={p.kind === "task" ? "#10b981" : degree.has(p.id) ? "#4f46e5" : "#cbd5e1"} stroke="#fff" strokeWidth={2} />
                    <text x={p.x + (right ? r + 5 : -r - 5)} y={p.y + 4} textAnchor={right ? "start" : "end"} fontSize={12} fill="#334155" className="hover:fill-indigo-700">
                      {short(p.label)}
                    </text>
                  </Link>
                );
              })}
            </svg>
            <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />โน้ตที่มีความสัมพันธ์</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />งาน</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" />โน้ตที่ยังไม่ถูกเชื่อม</span>
              <span>คลิกที่จุดเพื่อเปิด</span>
            </p>
          </div>
        )}
      </div>
    </NotesShell>
  );
}
