import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey } from "@/lib/dates";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { pickSpace } from "@/lib/space";
import { getManageableTeamIds } from "@/lib/teams";
import { CommentThread } from "@/components/comments";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "ประวัติเช็กอิน" };

const PAGE = 30;

/** เช็กอินย้อนหลังของตัวเองในพื้นที่ที่เลือก — แยกจากหน้า วันนี้ เพื่อให้หน้านั้นเบาและไม่รก */
export default async function StandupHistoryPage({ searchParams }: PageProps<"/standup/history">) {
  const user = await requireUser();
  const params = await searchParams;
  const teams = user.memberships.filter((m) => m.participates).map((m) => m.team);
  if (teams.length === 0) {
    return <EmptyState title="ยังไม่มีประวัติ" description="เช็กอินส่งแยกตามทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน" action={{ href: "/teams", label: "ไปหน้า ทีม" }} />;
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
          <p className="eyebrow">{team.personalOfId ? "พื้นที่ส่วนตัว" : team.name}</p>
          <h1 className="page-title">ประวัติเช็กอิน</h1>
          <p className="page-subtitle">{history.length === PAGE ? `${PAGE} ครั้งล่าสุด` : `${history.length} ครั้ง`} · เปลี่ยนพื้นที่ได้จากตัวเลือกที่แถบเมนู</p>
        </div>
        <Link href={`/standup?team=${team.id}`} className="btn-ghost">← กลับไปหน้า วันนี้</Link>
      </div>
      {history.length === 0 ? (
        <p className="card text-sm text-muted-foreground">ยังไม่มีเช็กอินในพื้นที่นี้</p>
      ) : (
        <div className="space-y-3">
          {history.map((s) => (
            <article key={s.id} className="card">
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{formatDateKey(dateToKey(s.date))}</h2>
              <StandupSections standup={s} />
              <div className="mt-2">
                <CommentThread canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={user.id} canModerate={manageableIds.has(team.id)} subject={`เช็กอิน ${formatDateKey(dateToKey(s.date))}`} />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
