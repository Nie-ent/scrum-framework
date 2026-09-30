import { deleteTeam } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { sortTeamTree } from "@/lib/teams";
import { TeamForm } from "../forms";

export default async function TeamsPage() {
  const teams = sortTeamTree(
    await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true, children: true } },
        members: { where: { isLead: true }, include: { user: { select: { name: true } } } },
      },
    }),
  );
  const parents = teams.filter((t) => !t.parentId);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-1 font-semibold">เพิ่มทีม</h2>
        <p className="mb-3 text-sm text-slate-500">
          ซ้อนได้ 2 ชั้น เช่น ทีมใหญ่ &quot;Tribe Payment&quot; → ทีมย่อย &quot;Squad Checkout&quot; · หัวหน้าทีมใหญ่เห็นภาพรวมทุกทีมย่อย
        </p>
        <TeamForm parents={parents} />
      </div>
      <div className="card divide-y divide-slate-100">
        {teams.map((team) => (
          <div key={team.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${team.parentId ? "pl-6" : ""}`}>
            <div className="flex items-start gap-2">
              {team.parentId && <span className="pt-2 text-slate-400">└</span>}
              <TeamForm team={team} parents={parents} hasChildren={team._count.children > 0} />
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <span>
                {team._count.members} คน
                {team.members.length > 0 && ` · ★ ${team.members.map((m) => m.user.name).join(", ")}`}
              </span>
              {team._count.children === 0 && (
                <form action={deleteTeam}>
                  <input type="hidden" name="id" value={team.id} />
                  <button className="text-red-600 hover:underline">ลบ</button>
                </form>
              )}
            </div>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีทีม</p>}
      </div>
    </div>
  );
}
