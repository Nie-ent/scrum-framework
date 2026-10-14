import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { pickSpace } from "@/lib/space";
import { getManageableTeamIds } from "@/lib/teams";
import { CommentThread } from "@/components/comments";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("ประวัติเช็กอิน") };
}

const PAGE = 30;

/** เช็กอินย้อนหลังของตัวเองในพื้นที่ที่เลือก — แยกจากหน้า วันนี้ เพื่อให้หน้านั้นเบาและไม่รก */
export default async function StandupHistoryPage({ searchParams }: PageProps<"/standup/history">) {
  const user = await requireUser();
  const params = await searchParams;
  const teams = user.memberships.filter((m) => m.participates).map((m) => m.team);
  if (teams.length === 0) {
    return <EmptyState title={tr("ยังไม่มีประวัติ")} description={tr("เช็กอินส่งแยกตามทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน")} action={{ href: "/teams", label: tr("ไปหน้า ทีม") }} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const [history, manageableIds] = await Promise.all([
    prisma.standup.findMany({ where: { userId: user.id, teamId: team.id }, include: { comments: withComments }, orderBy: { date: "desc" }, take: PAGE }),
    getManageableTeamIds(user),
  ]);
  const canAttach = isFileStorageConfigured();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">{team.personalOfId ? tr("พื้นที่ส่วนตัว") : team.name}</p>
          <h1 className="page-title">{tr("ประวัติเช็กอิน")}</h1>
          <p className="page-subtitle">{history.length === PAGE ? tr("{0} ครั้งล่าสุด", [PAGE]) : tr("{0} ครั้ง", [history.length])} {tr("· เปลี่ยนพื้นที่ได้จากตัวเลือกที่แถบเมนู")}</p>
        </div>
        <Link href={`/standup?team=${team.id}`} className="btn-ghost">{tr("← กลับไปหน้า วันนี้")}</Link>
      </div>
      {history.length === 0 ? (
        <p className="card text-sm text-muted-foreground">{tr("ยังไม่มีเช็กอินในพื้นที่นี้")}</p>
      ) : (
        <div className="space-y-3">
          {history.map((s) => (
            <article key={s.id} className="card">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{formatDateKey(dateToKey(s.date))}</h2>
              <StandupSections teamId={team.id} standup={s} />
              <div className="mt-2">
                <CommentThread teamId={team.id} canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={user.id} canModerate={manageableIds.has(team.id)} subject={tr("เช็กอิน {0}", [formatDateKey(dateToKey(s.date))])} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
