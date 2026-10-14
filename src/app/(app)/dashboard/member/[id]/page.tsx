import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { teamsLabel } from "@/lib/permissions";
import { getVisibleTeams } from "@/lib/teams";
import { dateToKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";
import { Avatar } from "@/components/avatar";
import { CommentThread } from "@/components/comments";
import { Icon } from "@/components/icons";
import { personMentions } from "@/lib/backlinks";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { tr } from "@/lib/i18n/server";

export default async function MemberPage({ params }: PageProps<"/dashboard/member/[id]">) {
  const viewer = await requireOverviewAccess();
  const { id } = await params;
  const canAttach = isFileStorageConfigured();

  // หัวหน้าทีมดูได้เฉพาะคนในทีม/ทีมย่อยที่ตัวเองดูแล และเห็นเฉพาะ scrum ที่เขียนให้ทีมเหล่านั้น
  const visibleIds = (await getVisibleTeams(viewer)).map((t) => t.id);
  const member = await prisma.user.findFirst({
    where: { id, memberships: { some: { teamId: { in: visibleIds } } } },
    include: {
      role: true,
      // แสดงเฉพาะทีมที่ viewer ดูแล — ไม่เปิดเผยว่าคนนี้อยู่ทีมอื่นของลูกค้ารายอื่น
      memberships: { where: { teamId: { in: visibleIds } }, include: { team: true }, orderBy: { team: { name: "asc" } } },
      standups: {
        where: { teamId: { in: visibleIds } },
        include: { team: { select: { name: true } }, comments: withComments },
        orderBy: [{ date: "desc" }, { team: { name: "asc" } }],
        take: 30,
      },
    },
  });
  if (!member) notFound();
  const mentions = await personMentions(member.id, visibleIds, tr);

  return (
    <div className="space-y-4">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-indigo-600">{tr("← กลับภาพรวม")}</Link>
      <div className="flex items-center gap-4">
        <Avatar user={member} size={56} />
        <div>
        <h1 className="text-2xl font-semibold">{member.name}</h1>
        <p className="text-sm text-slate-500">
          {[...new Set(member.memberships.map((m) => m.title ?? member.role.name))].join(", ")} · {tr(teamsLabel(member.memberships))} · {member.email}
        </p>
        </div>
      </div>
      {mentions.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold">{tr("ถูกแท็กใน ({0})", [mentions.length])}</summary>
          <ul className="mt-2 space-y-1">
            {mentions.map((m) => (
              <li key={m.key}><Link href={m.href} className="inline-flex items-center gap-2 text-sm hover:text-primary"><Icon name={m.icon} className="h-4 w-4 shrink-0 text-subtle" /><span className="min-w-0 truncate">{m.label}</span></Link></li>
            ))}
          </ul>
        </details>
      )}
      <div className="space-y-3">
        {member.standups.map((s) => (
          <div key={s.id} className="card">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm font-medium text-slate-500">
              <span>{formatDateKey(dateToKey(s.date))}</span>
              <span className="badge badge-neutral">{s.team?.name ?? tr("ไม่ระบุทีม")}</span>
            </div>
            <StandupSections teamId={s.teamId} standup={s} />
            <div className="mt-2"><CommentThread teamId={s.teamId} canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={viewer.id} canModerate subject={tr("เช็กอิน {0}", [formatDateKey(dateToKey(s.date))])} open={s.comments.length > 0} /></div>
          </div>
        ))}
        {member.standups.length === 0 && <EmptyState title={tr("ยังไม่มีเช็กอิน")} description={tr("เมื่อสมาชิกส่งเช็กอิน ข้อมูลล่าสุดจะแสดงที่นี่")} />}
      </div>
    </div>
  );
}
