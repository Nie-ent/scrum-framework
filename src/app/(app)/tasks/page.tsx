import Link from "next/link";
import type { Metadata } from "next";
import { setTaskProgress } from "@/app/actions/tasks";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey, isDateKey, todayKey } from "@/lib/dates";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { EmptyState } from "@/components/ui-state";
import { DeleteTaskButton, SwipeDeleteTask, UndoDeleteProvider } from "./undo-delete";
import { TaskForm } from "./task-form";
import { ProgressSlider } from "./progress-slider";
import { DueForm } from "../calendar/due-form";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { CommentThread, LinkedText } from "@/components/comments";
import { ProgressRing } from "@/components/progress-ring";
import { Tooltip } from "@/components/tooltip";
import { withComments } from "@/lib/comments";
import { toFileItems, withAttachments } from "@/lib/attachments";
import { AttachButton, AttachmentList } from "@/components/attachments";
import { isFileStorageConfigured } from "@/lib/file-store";

export const metadata: Metadata = { title: "งาน" };

/**
 * รายการงานแบบกะทัดรัด: แต่ละแถวมีแค่สิ่งที่ใช้กวาดตามอง — รายละเอียด ความคืบหน้า ไฟล์ และความคิดเห็น
 * อยู่ในแผงรายละเอียด (?task=เลขงาน) ที่เปิดด้านข้างบนจอใหญ่ และเต็มจอบนมือถือ
 */
export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();

  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title="ยังไม่มีพื้นที่ทำงาน" description="ลองโหลดหน้าใหม่อีกครั้ง" />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const canManage = manageableIds.has(team.id);
  const canAttach = isFileStorageConfigured();
  const shared = !team.personalOfId;
  // มาจากการกดวันในหน้า ปฏิทิน — เติมกำหนดส่งให้ในฟอร์มเพิ่มงาน
  const defaultDue = isDateKey(params.due) && params.due >= today ? params.due : undefined;

  const [members, tasks] = await Promise.all([
    canManage
      ? prisma.teamMember.findMany({
          where: { teamId: team.id, participates: true, user: { active: true } },
          select: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      // ทุกคนในทีมเห็นงานของกันและกัน (อ่าน + แสดงความคิดเห็น) — แก้ไขได้เฉพาะงานตัวเองหรือหัวหน้าทีม
      where: { teamId: team.id, deletedAt: null },
      include: {
        assignee: { select: { id: true, name: true, avatarUpdatedAt: true } },
        createdBy: { select: { id: true, name: true } },
        comments: withComments,
        attachments: withAttachments,
        // โน้ตที่อ้างถึงงานนี้ด้วย #เลขงาน
        noteLinks: { where: { from: { deletedAt: null } }, select: { from: { select: { id: true, title: true } } } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
  ]);

  const open = tasks.filter((t) => t.progress < 100);
  const finished = tasks.filter((t) => t.progress >= 100).sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
  const overdue = open.filter((t) => t.dueDate && dateToKey(t.dueDate) < today).length;

  // ตัวกรองจากลิงก์ (เช่นป้าย "เลยกำหนด" ในหน้าสถิติ): เฉพาะงานเลยกำหนด และ/หรือของคนเดียว
  const onlyOverdue = params.overdue === "1";
  const who = typeof params.who === "string" ? tasks.find((t) => t.assignee.id === params.who)?.assignee : undefined;
  const filtered = onlyOverdue || Boolean(who);
  const shown = open.filter((t) => (!onlyOverdue || (t.dueDate && dateToKey(t.dueDate) < today)) && (!who || t.assignee.id === who.id));

  // จัดกลุ่มตามคน — งานของตัวเองขึ้นก่อน
  const groups = [...new Map(shown.map((t) => [t.assignee.id, t.assignee])).values()]
    .map((assignee) => ({
      id: assignee.id,
      name: assignee.id === user.id ? "งานของฉัน" : assignee.name,
      person: assignee,
      tasks: shown.filter((t) => t.assignee.id === assignee.id),
    }))
    .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const mine = open.filter((t) => t.assignee.id === user.id);

  type TaskRow = (typeof tasks)[number];
  const canDelete = (t: TaskRow) => canManage || (t.assignee.id === user.id && t.createdBy?.id === user.id);
  const canUpdate = (t: TaskRow) => canManage || t.assignee.id === user.id;
  const all = `/tasks?team=${team.id}`;
  const base = `${all}${onlyOverdue ? "&overdue=1" : ""}${who ? `&who=${who.id}` : ""}`;
  const detailHref = (t: TaskRow) => (t.number === null ? base : `${base}&task=${t.number}`);
  const selected = typeof params.task === "string" ? tasks.find((t) => String(t.number) === params.task) : undefined;

  const row = (t: TaskRow) => {
    const dueKey = t.dueDate ? dateToKey(t.dueDate) : null;
    const done = t.progress >= 100;
    const late = dueKey !== null && dueKey < today && !done;
    const files = toFileItems(t.attachments, user.id).length;
    return (
      <div className={`flex items-center gap-2.5 py-2 ${selected?.id === t.id ? "rounded-xl bg-primary-soft/60" : ""}`}>
        {canUpdate(t) && !done ? (
          <form action={setTaskProgress} className="shrink-0">
            <input type="hidden" name="id" value={t.id} />
            <input type="hidden" name="progress" value={100} />
            <Tooltip label="ทำเสร็จแล้ว (100%)">
              <button aria-label={`ทำงาน ${t.title} เสร็จแล้ว`} className="flex size-9 items-center justify-center rounded-full transition hover:bg-success-soft">
                <ProgressRing value={t.progress} />
              </button>
            </Tooltip>
          </form>
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center"><ProgressRing value={t.progress} /></span>
        )}
        <Link href={detailHref(t)} scroll={false} className="flex min-w-0 flex-1 items-center gap-x-3 gap-y-0.5 max-sm:flex-wrap">
          <span className="min-w-0 flex-1 basis-full sm:basis-0">
            <span className={`block truncate text-sm ${done ? "text-subtle line-through" : "font-medium text-foreground"}`}>
              {t.number !== null && <span className="mr-1.5 font-normal tabular-nums text-subtle">#{t.number}</span>}
              {t.title}
            </span>
          </span>
          {dueKey && !done && (
            <span className={`badge shrink-0 ${late ? "badge-danger" : dueKey === today ? "badge-warning" : "badge-neutral"}`}>
              {late ? "เลยกำหนด " : dueKey === today ? "วันนี้" : ""}{dueKey === today ? "" : formatDateKey(dueKey).replace(/ \d{4}$/, "")}
            </span>
          )}
          {done && t.doneAt && <span className="shrink-0 text-xs text-subtle">{formatDateKey(dateToKey(t.doneAt)).replace(/ \d{4}$/, "")}</span>}
          {(t.comments.length > 0 || files > 0 || t.noteLinks.length > 0) && (
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              {t.comments.length > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="comment" className="h-3.5 w-3.5" />{t.comments.length}</span>}
              {files > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="paperclip" className="h-3.5 w-3.5" />{files}</span>}
              {t.noteLinks.length > 0 && <span className="inline-flex items-center gap-0.5"><Icon name="note" className="h-3.5 w-3.5" />{t.noteLinks.length}</span>}
            </span>
          )}
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{t.progress}%</span>
        </Link>
      </div>
    );
  };

  const renderTask = (t: TaskRow) => (
    <li key={t.id} id={t.number === null ? undefined : `task-${t.number}`} className="scroll-mt-24">
      {canDelete(t) ? <SwipeDeleteTask id={t.id} title={t.title}>{row(t)}</SwipeDeleteTask> : row(t)}
    </li>
  );

  return (
    <UndoDeleteProvider>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <p className="eyebrow">รายการงาน</p>
            <h1 className="page-title">งาน</h1>
            <p className="page-subtitle">
              {team.name} · ค้างอยู่ {open.length} งาน{shared && mine.length !== open.length && ` (ของฉัน ${mine.length})`}
              {overdue > 0 && <> · <Link href={`${all}&overdue=1`} className="font-medium text-danger underline-offset-2 hover:underline">เลยกำหนด {overdue}</Link></>}
            </p>
          </div>
        </div>

        <section className="card scroll-mt-24" id="new">
          <TaskForm key={`${team.id}:${defaultDue ?? ""}`} canAttach={canAttach} defaultDue={defaultDue} teamId={team.id} selfId={user.id} members={canManage ? members.map((m) => m.user) : null} today={today} />
        </section>

        {filtered && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-sunken px-4 py-2.5 text-sm">
            <span className="text-foreground">
              กำลังแสดงเฉพาะ{onlyOverdue ? "งานที่เลยกำหนด" : "งานค้าง"}{who && <>ของ <b className="font-semibold">{who.name}</b></>} · {shown.length} งาน
            </span>
            <Link href={all} className="font-medium text-primary hover:text-primary-strong">ดูงานทั้งหมด</Link>
          </div>
        )}

        {filtered && shown.length === 0 ? (
          <p className="card text-sm text-muted-foreground">ไม่มีงานที่ตรงกับตัวกรองนี้</p>
        ) : open.length === 0 ? (
          <EmptyState title="ไม่มีงานค้าง" description={shared ? "เพิ่มงานจากช่องด้านบน งานของคุณจะไปขึ้นในหน้าเช็กอินด้วย" : "พิมพ์ชื่องานในช่องด้านบนแล้วกด Enter เพื่อเริ่มรายการของคุณ"} />
        ) : (
          groups.map((g) => (
            <section key={g.id} className="card">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">{shared && <Avatar user={g.person} size={24} />}{g.name}</h2>
                <span className="badge badge-neutral">{g.tasks.length} งาน</span>
              </div>
              <ul className="divide-y divide-border">{g.tasks.map(renderTask)}</ul>
            </section>
          ))
        )}

        {!filtered && finished.length > 0 && (
          <details className="card" open={selected ? selected.progress >= 100 : undefined}>
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">เสร็จแล้ว ({finished.length})</summary>
            <ul className="mt-2 divide-y divide-border">{finished.slice(0, 30).map(renderTask)}</ul>
          </details>
        )}
      </div>

      {selected && (
        <>
          {/* ฉากหลัง: กดเพื่อปิดแผง */}
          <Link href={base} scroll={false} aria-label="ปิดรายละเอียดงาน" className="fixed inset-0 z-40 hidden bg-foreground/20 lg:block" />
          <aside aria-label={`รายละเอียดงาน ${selected.title}`} className="fixed inset-0 z-50 overflow-y-auto bg-surface shadow-overlay lg:inset-y-0 lg:left-auto lg:w-[30rem] lg:border-l lg:border-border">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-5">
              <Link href={base} scroll={false} className="btn-ghost min-h-9 gap-1 px-2.5 py-1 text-sm">← <span className="lg:hidden">กลับ</span><span className="max-lg:hidden">ปิด</span></Link>
              <span className="text-sm tabular-nums text-subtle">{selected.number !== null && `#${selected.number}`}</span>
              {canDelete(selected) ? <DeleteTaskButton id={selected.id} title={selected.title} /> : <span className="w-8" />}
            </div>
            <div className="space-y-6 px-4 py-5 pb-28 sm:px-5 lg:pb-8">
              <div>
                <h2 className={`text-xl font-semibold leading-snug ${selected.progress >= 100 ? "text-muted-foreground line-through" : "text-foreground"}`}>{selected.title}</h2>
                {selected.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground"><LinkedText text={selected.description} /></p>}
              </div>

              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
                {shared && (
                  <>
                    <dt className="text-muted-foreground">ผู้รับงาน</dt>
                    <dd className="flex items-center gap-2"><Avatar user={selected.assignee} size={24} />{selected.assignee.name}</dd>
                  </>
                )}
                {selected.createdBy && selected.createdBy.id !== selected.assignee.id && (
                  <>
                    <dt className="text-muted-foreground">มอบหมายโดย</dt>
                    <dd>{selected.createdBy.name}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">กำหนดส่ง</dt>
                <dd>
                  {canUpdate(selected) ? (
                    <div className="[&>form]:justify-start"><DueForm id={selected.id} title={selected.title} dueDate={selected.dueDate ? dateToKey(selected.dueDate) : null} /></div>
                  ) : selected.dueDate ? (
                    formatDateKey(dateToKey(selected.dueDate))
                  ) : (
                    <span className="text-subtle">ยังไม่กำหนด</span>
                  )}
                </dd>
              </dl>

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ProgressRing value={selected.progress} size={22} />ความคืบหน้า {selected.progress}%</h3>
                {canUpdate(selected) ? (
                  <form action={setTaskProgress} className="space-y-2">
                    <input type="hidden" name="id" value={selected.id} />
                    <ProgressSlider key={`${selected.id}:${selected.progress}`} defaultValue={selected.progress} label={`ความคืบหน้าของ ${selected.title} (%)`} />
                    <div className="flex items-center gap-2">
                      <input name="reason" maxLength={500} placeholder="เหตุผล / หมายเหตุ (ไม่บังคับ)" aria-label="เหตุผลของการอัปเดต" className="input flex-1 py-2 text-sm" />
                      <button className="btn shrink-0">บันทึก</button>
                    </div>
                    <p className="text-xs text-muted-foreground">การเปลี่ยนแปลงและเหตุผลจะถูกบันทึกไว้ในความคิดเห็นด้านล่าง</p>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">อัปเดตได้เฉพาะผู้รับงานหรือหัวหน้าทีม</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">ไฟล์แนบ</h3>
                <AttachmentList files={toFileItems(selected.attachments, user.id)} canModerate={canManage} />
                {toFileItems(selected.attachments, user.id).length === 0 && <p className="text-sm text-subtle">ยังไม่มีไฟล์</p>}
                {canAttach && (canUpdate(selected) || selected.createdBy?.id === user.id) && <AttachButton target={{ taskId: selected.id }} />}
              </section>

              {selected.noteLinks.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">โน้ตที่อ้างถึงงานนี้</h3>
                  <ul className="space-y-1">
                    {selected.noteLinks.map((l) => (
                      <li key={l.from.id}><Link href={`/notes/${l.from.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-strong"><Icon name="note" className="h-4 w-4 text-subtle" />{l.from.title}</Link></li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-1 text-sm font-semibold">ความคิดเห็นและประวัติ</h3>
                <CommentThread canAttach={canAttach} target={{ taskId: selected.id }} comments={selected.comments} viewerId={user.id} canModerate={canManage} subject={selected.title} open />
              </section>
            </div>
          </aside>
        </>
      )}
    </UndoDeleteProvider>
  );
}
