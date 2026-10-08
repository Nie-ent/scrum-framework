import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toFileItems, withAttachments } from "@/lib/attachments";
import { attachmentTtlDays } from "@/lib/attachment-store";
import { dateToKey, formatDateKey, formatDateTime } from "@/lib/dates";
import { getVisibleTeams, sortTeamTree } from "@/lib/teams";
import { AttachmentList } from "@/components/attachments";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "ไฟล์สำคัญ" };

/** ไฟล์แนบที่ถูก mark ว่าสำคัญ (เก็บถาวร) ของแต่ละทีม */
export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const user = await requireUser();
  const params = await searchParams;

  // ทีมที่เข้าหน้านี้ได้ = ทีมที่ตัวเองอยู่ + ทีมที่ดูแล (เหมือนหน้า งาน)
  const manageable = await getVisibleTeams(user);
  const manageableIds = new Set(manageable.map((t) => t.id));
  const teams = sortTeamTree([
    ...manageable,
    ...user.memberships.map((m) => m.team).filter((t) => !manageableIds.has(t.id)),
  ]);
  if (teams.length === 0) {
    return <EmptyState title="คุณยังไม่ได้อยู่ในทีมไหน" description="ไฟล์ถูกแนบภายในทีม — ติดต่อผู้ดูแลระบบให้เพิ่มคุณเข้าทีมก่อน" />;
  }
  const team = teams.find((t) => t.id === params.team) ?? teams.find((t) => user.memberships.some((m) => m.teamId === t.id)) ?? teams[0];
  const canManage = manageableIds.has(team.id);

  const inTeam = { teamId: team.id, deletedAt: null };
  const files = await prisma.attachment.findMany({
    where: {
      uploadedAt: { not: null },
      importantAt: { not: null },
      OR: [{ task: inTeam }, { comment: { task: inTeam } }, { comment: { standup: { teamId: team.id } } }],
    },
    select: {
      ...withAttachments.select,
      uploader: { select: { name: true } },
      importantBy: { select: { name: true } },
      task: { select: { title: true } },
      comment: {
        select: {
          task: { select: { title: true } },
          standup: { select: { date: true, user: { select: { name: true } } } },
        },
      },
    },
    orderBy: { importantAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">Kept files</p>
          <h1 className="page-title">ไฟล์สำคัญ</h1>
          <p className="page-subtitle">{team.name} · {files.length} ไฟล์ที่ถูก mark ให้เก็บไว้</p>
        </div>
      </div>

      {teams.length > 1 && (
        <nav aria-label="เลือกทีม" className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/files?team=${t.id}`}
              aria-current={t.id === team.id ? "page" : undefined}
              className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm transition ${
                t.id === team.id ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {t.name}
            </Link>
          ))}
        </nav>
      )}

      <p className="text-sm text-slate-500">
        ไฟล์ที่แนบในงานและความคิดเห็นเป็นไฟล์ชั่วคราว จะถูกลบเองหลัง {attachmentTtlDays()} วัน — คลิกขวาที่ไฟล์ (หรือกด ⋯) แล้วเลือก &quot;Mark ว่าสำคัญ&quot; เพื่อเก็บไว้ที่นี่
      </p>

      {files.length === 0 ? (
        <EmptyState title="ยังไม่มีไฟล์ที่ถูก mark" description="คลิกขวาที่ไฟล์แนบในหน้า งาน หรือในความคิดเห็น แล้วเลือก Mark ว่าสำคัญ ไฟล์จะมาอยู่ที่นี่และไม่ถูกลบ" action={{ href: `/tasks?team=${team.id}`, label: "ไปหน้า งาน" }} />
      ) : (
        <section className="card">
          <ul className="divide-y divide-slate-100">
            {files.map((f) => {
              const taskTitle = f.task?.title ?? f.comment?.task?.title;
              const standup = f.comment?.standup;
              return (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3">
                  <AttachmentList files={toFileItems([f], user.id)} canModerate={canManage} />
                  <p className="text-xs text-slate-500">
                    {taskTitle ? `งาน: ${taskTitle}` : standup ? `เช็กอินของ ${standup.user.name} · ${formatDateKey(dateToKey(standup.date))}` : ""}
                    {f.comment && " (ในความคิดเห็น)"}
                    {f.uploader && ` · แนบโดย ${f.uploader.name}`}
                    {f.importantAt && ` · mark${f.importantBy ? `โดย ${f.importantBy.name}` : ""} ${formatDateTime(f.importantAt)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
