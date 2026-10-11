import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { toFileItems, withAttachments } from "@/lib/attachments";
import { attachmentTtlDays } from "@/lib/attachment-store";
import { dateToKey, formatDateKey, formatDateTime } from "@/lib/dates";
import { getVisibleTeams, sortTeamTree } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { AttachmentList } from "@/components/attachments";
import { EmptyState } from "@/components/ui-state";
import { HelpTip } from "@/components/tooltip";

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
  const team = (await pickSpace(teams, params.team))!;
  const canManage = manageableIds.has(team.id);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const view = params.view === "grid" ? "grid" : "list";
  const link = (next: { q?: string; view?: string }) => {
    const query = new URLSearchParams({ team: team.id });
    if (next.q ?? q) query.set("q", next.q ?? q);
    if ((next.view ?? view) === "grid") query.set("view", "grid");
    return `/files?${query}`;
  };

  const inTeam = { teamId: team.id, deletedAt: null };
  const files = await prisma.attachment.findMany({
    where: {
      uploadedAt: { not: null },
      importantAt: { not: null },
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
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

  // ไฟล์นี้มาจากงานหรือเช็กอินไหน
  const source = (f: (typeof files)[number]) => {
    const taskTitle = f.task?.title ?? f.comment?.task?.title;
    const standup = f.comment?.standup;
    return `${taskTitle ? `งาน: ${taskTitle}` : standup ? `เช็กอินของ ${standup.user.name} · ${formatDateKey(dateToKey(standup.date))}` : ""}${f.comment ? " (ในความคิดเห็น)" : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">ไฟล์ที่เก็บไว้</p>
          <h1 className="page-title flex items-center gap-1.5">ไฟล์สำคัญ <HelpTip title="ไฟล์ชั่วคราวกับไฟล์สำคัญ">{`ไฟล์ที่แนบในงานและความคิดเห็นจะถูกลบเองหลัง ${attachmentTtlDays()} วัน เพื่อไม่ให้พื้นที่เต็ม ถ้าทำเครื่องหมายว่าสำคัญ ไฟล์จะถูกเก็บไว้ถาวรและมารวมอยู่ที่หน้านี้`}</HelpTip></h1>
          <p className="page-subtitle">{team.name} · {files.length} ไฟล์{q ? `ที่ชื่อตรงกับ "${q}"` : "ที่ทำเครื่องหมายให้เก็บไว้"}</p>
        </div>
      </div>


      <div className="flex flex-wrap items-center gap-2">
        <form action="/files" className="flex min-w-0 flex-1 basis-64 gap-2">
          <input type="hidden" name="team" value={team.id} />
          {view === "grid" && <input type="hidden" name="view" value="grid" />}
          <input name="q" type="search" defaultValue={q} className="input py-2" placeholder="ค้นหาชื่อไฟล์" aria-label="ค้นหาชื่อไฟล์" />
          <button className="btn-ghost shrink-0">ค้นหา</button>
        </form>
        <nav aria-label="มุมมอง" className="flex rounded-full bg-surface-sunken p-1">
          {([["list", "รายการ"], ["grid", "ตาราง"]] as const).map(([v, label]) => (
            <Link key={v} href={link({ view: v })} aria-current={v === view ? "true" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3.5 text-sm transition ${v === view ? "bg-surface font-semibold text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{label}</Link>
          ))}
        </nav>
      </div>

      {files.length === 0 ? (
        q ? (
          <p className="card text-sm text-muted-foreground">ไม่พบไฟล์ที่ชื่อตรงกับ &quot;{q}&quot; · <Link href={`/files?team=${team.id}${view === "grid" ? "&view=grid" : ""}`} className="font-medium text-primary hover:text-primary-strong">ล้างการค้นหา</Link></p>
        ) : (
          <EmptyState title="ยังไม่มีไฟล์สำคัญ" description="คลิกขวาที่ไฟล์แนบในหน้า งาน หรือในความคิดเห็น (หรือกด ⋯) แล้วเลือก ทำเครื่องหมายว่าสำคัญ ไฟล์จะมาอยู่ที่นี่และไม่ถูกลบ" action={{ href: `/tasks?team=${team.id}`, label: "ไปหน้า งาน" }} />
        )
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {files.map((f) => {
            const [item] = toFileItems([f], user.id);
            if (!item) return null;
            return (
              <li key={f.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
                <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" aria-label={`เปิดไฟล์ ${f.name}`} className="flex aspect-[4/3] items-center justify-center bg-surface-sunken text-subtle transition hover:brightness-95">
                  {item.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ลิงก์ชั่วคราวจากที่เก็บไฟล์ ไม่ผ่าน next/image
                    <img src={`/api/files/${f.id}`} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5"><Icon name="paperclip" className="h-8 w-8" /><span className="text-2xs font-semibold uppercase tracking-wide">{f.name.includes(".") ? f.name.split(".").pop()!.slice(0, 5) : "ไฟล์"}</span></span>
                  )}
                </a>
                <div className="min-w-0 space-y-1 p-2.5">
                  <AttachmentList files={[item]} canModerate={canManage} />
                  <p className="truncate text-xs text-muted-foreground">{source(f)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="card">
          <ul className="divide-y divide-border">
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 py-3">
                <AttachmentList files={toFileItems([f], user.id)} canModerate={canManage} />
                <p className="text-xs text-muted-foreground">
                  {source(f)}
                  {f.uploader && ` · แนบโดย ${f.uploader.name}`}
                  {f.importantAt && ` · เก็บไว้${f.importantBy ? `โดย ${f.importantBy.name}` : ""} ${formatDateTime(f.importantAt)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
