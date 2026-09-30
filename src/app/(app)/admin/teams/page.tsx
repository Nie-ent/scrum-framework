import { deleteTeam } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { TeamForm } from "../forms";

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-3 font-semibold">เพิ่มทีม</h2>
        <TeamForm />
      </div>
      <div className="card divide-y divide-slate-100">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <TeamForm team={team} />
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {team._count.users} คน
              <form action={deleteTeam}>
                <input type="hidden" name="id" value={team.id} />
                <button className="text-red-600 hover:underline">ลบ</button>
              </form>
            </div>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีทีม</p>}
      </div>
    </div>
  );
}
