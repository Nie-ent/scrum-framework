import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEVEL } from "@/lib/permissions";
import { visibleUsersWhere } from "@/lib/scope";
import { dateToKey, formatDateKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";

export default async function MemberPage({ params }: PageProps<"/dashboard/member/[id]">) {
  const viewer = await requireUser(LEVEL.LEAD);
  const { id } = await params;

  const member = await prisma.user.findFirst({
    where: { AND: [{ id }, visibleUsersWhere(viewer)] },
    include: { role: true, team: true, standups: { orderBy: { date: "desc" }, take: 30 } },
  });
  if (!member) notFound();

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-indigo-600">← กลับภาพรวม</Link>
      <div>
        <h1 className="text-2xl font-semibold">{member.name}</h1>
        <p className="text-sm text-slate-500">
          {member.role.name} · Lv {member.role.level}
          {member.team && ` · ${member.team.name}`} · {member.email}
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
