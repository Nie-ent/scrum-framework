import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { canViewAllTeams, teamsLabel } from "@/lib/permissions";
import { getVisibleTeams } from "@/lib/teams";
import { dateToKey, formatDateKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";

export default async function MemberPage({ params }: PageProps<"/dashboard/member/[id]">) {
  const viewer = await requireOverviewAccess();
  const { id } = await params;

  // หัวหน้าทีมดูได้เฉพาะคนในทีม/ทีมย่อยที่ตัวเองดูแล และเห็นเฉพาะ scrum ที่เขียนให้ทีมเหล่านั้น
  const all = canViewAllTeams(viewer.role.level);
  const visibleIds = all ? [] : (await getVisibleTeams(viewer)).map((t) => t.id);
  const member = await prisma.user.findFirst({
    where: { id, ...(all ? {} : { memberships: { some: { teamId: { in: visibleIds } } } }) },
    include: {
      role: true,
      memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } },
      standups: {
        where: all ? {} : { teamId: { in: visibleIds } },
        include: { team: { select: { name: true } } },
        orderBy: [{ date: "desc" }, { team: { name: "asc" } }],
        take: 30,
      },
    },
  });
  if (!member) notFound();

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-indigo-600">← กลับภาพรวม</Link>
      <div>
        <h1 className="text-2xl font-semibold">{member.name}</h1>
        <p className="text-sm text-slate-500">
          {member.role.name} · Lv {member.role.level} · {teamsLabel(member.memberships)} · {member.email}
        </p>
      </div>
      <div className="space-y-3">
        {member.standups.map((s) => (
          <div key={s.id} className="card">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-slate-500">
              <span>{formatDateKey(dateToKey(s.date))}</span>
              <span className="badge badge-neutral">{s.team?.name ?? "ไม่ระบุทีม"}</span>
            </div>
            <StandupSections standup={s} />
          </div>
        ))}
        {member.standups.length === 0 && <EmptyState title="ยังไม่มี Daily Scrum" description="เมื่อสมาชิกส่งเช็กอิน ข้อมูลล่าสุดจะแสดงที่นี่" />}
      </div>
    </div>
  );
}
