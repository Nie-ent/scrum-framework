import { deleteTeam } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { sortTeamTree } from "@/lib/teams";
import { GrantPlanForm, TeamForm } from "../forms";
import { dateToKey, todayKey } from "@/lib/dates";
import { planState } from "@/lib/plans";
import { tr } from "@/lib/i18n/server";

export default async function TeamsPage() {
  const teams = sortTeamTree(
    await prisma.team.findMany({
      // ไม่รวมพื้นที่ส่วนตัวของผู้ใช้
      where: { personalOfId: null },
      orderBy: { name: "asc" },
      include: {
        _count: { select: { members: true, children: true } },
        subscription: true,
        members: { where: { access: { not: "MEMBER" } }, include: { user: { select: { name: true } } } },
      },
    }),
  );
  const parents = teams.filter((t) => !t.parentId);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-1 font-semibold">{tr("เพิ่มทีม")}</h2>
        <p className="mb-3 text-sm text-slate-500">
          {tr("ซ้อนได้ 2 ชั้น เช่น ทีมใหญ่ \"Tribe Payment\" → ทีมย่อย \"Squad Checkout\" · หัวหน้าทีมใหญ่เห็นภาพรวมทุกทีมย่อย")}
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
                {tr("{0} คน", [team._count.members])}
                {team.members.length > 0 && ` · ★ ${team.members.map((m) => m.user.name).join(", ")}`}
              </span>
              {team._count.children === 0 && (
                <form action={deleteTeam}>
                  <input type="hidden" name="id" value={team.id} />
                  <button className="text-red-600 hover:underline">{tr("ลบ")}</button>
                </form>
              )}
            </div>
            {!team.parentId && (
              <div className="flex w-full flex-wrap items-center gap-3 pl-1 text-xs text-muted-foreground">
                <span>{tr("แพ็กเกจ")}: {planState(team.subscription).plan === "FREE" ? tr("ฟรี") : tr("ทีม")} · {tr("{0} ที่นั่ง", [planState(team.subscription).seats])}{team.subscription?.stripeSubscriptionId && ` · Stripe ${team.subscription.status}`}</span>
                <GrantPlanForm teamId={team.id} seats={team.subscription?.compSeats ?? null} until={team.subscription?.compUntil ? dateToKey(team.subscription.compUntil) : ""} today={todayKey()} />
              </div>
            )}
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-slate-500">{tr("ยังไม่มีทีม")}</p>}
      </div>
    </div>
  );
}
