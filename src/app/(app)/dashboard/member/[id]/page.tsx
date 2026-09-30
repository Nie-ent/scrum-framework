import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { canViewAllTeams, teamsLabel } from "@/lib/permissions";
import { getVisibleTeams } from "@/lib/teams";
import { dateToKey, formatDateKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";

export default async function MemberPage({ params }: PageProps<"/dashboard/member/[id]">) {
  const viewer = await requireOverviewAccess();
  const { id } = await params;

  // หัวหน้าทีมดูได้เฉพาะคนที่อยู่ในทีม/ทีมย่อยที่ตัวเองดูแล
  const scope = canViewAllTeams(viewer.role.level)
    ? {}
    : { memberships: { some: { teamId: { in: (await getVisibleTeams(viewer)).map((t) => t.id) } } } };
  const member = await prisma.user.findFirst({
    where: { id, ...scope },
    include: {
      role: true,
      memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } },
      standups: { orderBy: { date: "desc" }, take: 30 },
    },
  });
  if (!member) notFound();

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-blue-600">← กลับภาพรวม</Link>
      <div>
        <h1 className="text-2xl font-semibold">{member.name}</h1>
        <p className="text-sm text-slate-500">
          {member.role.name} · Lv {member.role.level} · {teamsLabel(member.memberships)} · {member.email}
        </p>
      </div>
      <div className="space-y-3">
        {member.standups.map((s) => (
          <div key={s.id} className="card">
            <div className="mb-2 text-sm font-medium text-slate-500">{formatDateKey(dateToKey(s.date))}</div>
            <StandupSections standup={s} />
          </div>
        ))}
        {member.standups.length === 0 && <p className="text-sm text-slate-500">ยังไม่มี daily scrum</p>}
      </div>
    </div>
  );
}
