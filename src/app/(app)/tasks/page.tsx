import Link from "next/link";
import type { Metadata } from "next";
import { setTaskProgress } from "@/app/actions/tasks";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, isDateKey, todayKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { EmptyState } from "@/components/ui-state";
import { DeleteTaskButton, SwipeDeleteTask, UndoDeleteProvider } from "./undo-delete";
import { TaskForm } from "./task-form";
import { TaskSearch } from "./task-search";
import { ProgressSlider } from "./progress-slider";
import { DueForm } from "../calendar/due-form";
import { TaskEdit } from "./task-edit";
import { AddSubtask, LabelPicker, ParentPicker, WaitingEditor } from "./task-structure";
import { availableLabels } from "@/lib/task-structure";
import { labelClass } from "@/lib/labels";
import { refContext } from "@/lib/ref-context";
import { taskBacklinks } from "@/lib/backlinks";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { CommentThread, LinkedText } from "@/components/comments";
import { ProgressRing } from "@/components/progress-ring";
import { Tooltip } from "@/components/tooltip";
import { withComments } from "@/lib/comments";
import { toFileItems, withAttachments } from "@/lib/attachments";
import { AttachButton, AttachmentList } from "@/components/attachments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("งาน") };
}

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
    return <EmptyState title={tr("ยังไม่มีพื้นที่ทำงาน")} description={tr("ลองโหลดหน้าใหม่อีกครั้ง")} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const canManage = manageableIds.has(team.id);
  const canAttach = isFileStorageConfigured();
  const shared = !team.personalOfId;
  // มาจากการกดวันในหน้า ปฏิทิน — เติมกำหนดส่งให้ในฟอร์มเพิ่มงาน
  const defaultDue = isDateKey(params.due) && params.due >= today ? params.due : undefined;

  const [members, tasks] = await Promise.all([
    // ใช้เลือกผู้รับงานตอนสร้าง (หัวหน้า) และตอนโอนงาน (หัวหน้าหรือคนที่มอบหมาย)
    shared
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
        labels: { select: { labelId: true } },
        blockedBy: { select: { blockedById: true } },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
  ]);

  const [labels, ctx] = await Promise.all([availableLabels(team.id), refContext(team.id)]);
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const childrenOf = (id: string) => tasks.filter((t) => t.parentId === id);
  // งานที่ต้องรอและยังไม่เสร็จ
  const waitingOn = (t: (typeof tasks)[number]) => t.blockedBy.flatMap((b) => { const x = byId.get(b.blockedById); return x && x.progress < 100 ? [x] : []; });
  const labelFilter = typeof params.label === "string" && labelById.has(params.label) ? labelById.get(params.label)! : undefined;

  const open = tasks.filter((t) => t.progress < 100);
  const finished = tasks.filter((t) => t.progress >= 100).sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
  const overdue = open.filter((t) => t.dueDate && dateToKey(t.dueDate) < today).length;

  // ตัวกรองจากลิงก์ (เช่นป้าย "เลยกำหนด" ในหน้าสถิติ): เฉพาะงานเลยกำหนด และ/หรือของคนเดียว
  const onlyOverdue = params.overdue === "1";
  const who = typeof params.who === "string" ? tasks.find((t) => t.assignee.id === params.who)?.assignee : undefined;
  // คำค้น: ชื่องาน รายละเอียด เลขงาน (#12 หรือ 12) ชื่อผู้รับงาน หรือชื่อผู้มอบหมาย
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  // หลายคำ = ต้องเจอทุกคำ (ไม่ต้องเรียงติดกัน)
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (t: (typeof tasks)[number]) => {
    const texts = [t.title, t.description ?? "", t.assignee.name, t.createdBy?.name ?? ""].map((text) => text.toLowerCase());
    return words.every((word) => texts.some((text) => text.includes(word)) || (t.number !== null && String(t.number) === word.replace(/^#/, "")));
  };
  const scoped = onlyOverdue || Boolean(who) || Boolean(labelFilter);
  const filtered = scoped || Boolean(q);
  const shown = open.filter((t) => (!onlyOverdue || (t.dueDate && dateToKey(t.dueDate) < today)) && (!who || t.assignee.id === who.id) && (!labelFilter || t.labels.some((l) => l.labelId === labelFilter.id)) && matches(t));
  // งานที่เสร็จแล้วค้นเจอได้ด้วย (ตัวกรองเลยกำหนด/รายคน ดูเฉพาะงานค้าง)
  const finishedShown = scoped ? [] : finished.filter(matches);

  // จัดกลุ่มตามคน — งานของตัวเองขึ้นก่อน
  const groups = [...new Map(shown.map((t) => [t.assignee.id, t.assignee])).values()]
    .map((assignee) => ({
      id: assignee.id,
      name: assignee.id === user.id ? tr("งานของฉัน") : assignee.name,
      person: assignee,
      tasks: shown.filter((t) => t.assignee.id === assignee.id),
    }))
    .sort((a, b) => Number(b.id === user.id) - Number(a.id === user.id));
  const mine = open.filter((t) => t.assignee.id === user.id);

  type TaskRow = (typeof tasks)[number];
  const canDelete = (t: TaskRow) => canManage || (t.assignee.id === user.id && t.createdBy?.id === user.id);
  const canUpdate = (t: TaskRow) => canManage || t.assignee.id === user.id;
  // กฎเดียวกับ editTaskFor ใน lib/task-ops
  const canEditText = (t: TaskRow) => canUpdate(t) || t.createdBy?.id === user.id;
  const canReassign = (t: TaskRow) => shared && (canManage || (t.createdBy?.id === user.id && t.createdBy.id !== t.assignee.id));
  const all = `/tasks?team=${team.id}`;
  const scope = `${all}${onlyOverdue ? "&overdue=1" : ""}${who ? `&who=${who.id}` : ""}${labelFilter ? `&label=${labelFilter.id}` : ""}`;
  const base = `${scope}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const detailHref = (t: TaskRow) => (t.number === null ? base : `${base}&task=${t.number}`);
  const selected = typeof params.task === "string" ? tasks.find((t) => String(t.number) === params.task) : undefined;
  // ที่อื่นที่อ้างถึงงานนี้ (#เลขงาน ในงานอื่น ความคิดเห็น และเช็กอิน) — โน้ตอยู่ใน noteLinks แล้ว
  const backlinks = selected ? await taskBacklinks(selected.id, tr) : [];

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
            <Tooltip label={tr("ทำเสร็จแล้ว (100%)")}>
              <button aria-label={tr("ทำงาน {0} เสร็จแล้ว", [t.title])} className="flex size-9 items-center justify-center rounded-full transition hover:bg-success-soft">
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
            {t.createdBy && t.createdBy.id !== t.assignee.id && (
              <span className="block truncate text-xs text-subtle">{t.createdBy.id === user.id ? tr("มอบหมายโดยคุณ") : tr("มอบหมายโดย {0}", [t.createdBy.name])}</span>
            )}
            {(t.labels.length > 0 || t.parentId || childrenOf(t.id).length > 0 || waitingOn(t).length > 0) && (
              <span className="mt-0.5 flex flex-wrap items-center gap-1">
                {t.parentId && byId.get(t.parentId) && <span className="text-2xs text-subtle">↳ #{byId.get(t.parentId)!.number}</span>}
                {childrenOf(t.id).length > 0 && (
                  <span className="badge badge-neutral text-2xs">{tr("งานย่อย {0}/{1}", [childrenOf(t.id).filter((c) => c.progress >= 100).length, childrenOf(t.id).length])}</span>
                )}
                {waitingOn(t).length > 0 && <span className="badge badge-warning text-2xs">{tr("รอ {0}", [waitingOn(t).map((w) => `#${w.number}`).join(", ")])}</span>}
                {t.labels.map((l) => labelById.get(l.labelId)).filter(Boolean).map((l) => (
                  <span key={l!.id} className={`badge text-2xs ring-1 ${labelClass(l!.color)}`}>{l!.name}</span>
                ))}
              </span>
            )}
          </span>
          {dueKey && !done && (
            <span className={`badge shrink-0 ${late ? "badge-danger" : dueKey === today ? "badge-warning" : "badge-neutral"}`}>
              {late ? tr("เลยกำหนด ") : dueKey === today ? tr("วันนี้") : ""}{dueKey === today ? "" : formatDateKey(dueKey).replace(/ \d{4}$/, "")}
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
            <p className="eyebrow">{tr("รายการงาน")}</p>
            <h1 className="page-title">{tr("งาน")}</h1>
            <p className="page-subtitle">
              {team.name} · {tr("ค้างอยู่ {0} งาน", [open.length])}{shared && mine.length !== open.length && tr(" (ของฉัน {0})", [mine.length])}
              {overdue > 0 && <> · <Link href={`${all}&overdue=1`} className="font-medium text-danger underline-offset-2 hover:underline">{tr("เลยกำหนด")}{" "}{overdue}</Link></>}
            </p>
          </div>
        </div>

        <section className="card scroll-mt-24" id="new">
          <TaskForm key={`${team.id}:${defaultDue ?? ""}`} canAttach={canAttach} defaultDue={defaultDue} teamId={team.id} selfId={user.id} members={canManage ? members.map((m) => m.user) : null} today={today} />
        </section>

        {tasks.length > 0 && <TaskSearch key={scope} base={scope} q={q} />}
        {labels.length > 0 && (
          <nav aria-label={tr("กรองตามป้าย")} className="-mt-3 flex flex-wrap items-center gap-1.5">
            {labels.map((l) => (
              <Link key={l.id} href={labelFilter?.id === l.id ? all : `${all}&label=${l.id}`} aria-current={labelFilter?.id === l.id ? "true" : undefined} className={`badge ring-1 transition ${labelClass(l.color)} ${labelFilter?.id === l.id ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"}`}>
                {l.name}
              </Link>
            ))}
          </nav>
        )}

        {filtered && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-sunken px-4 py-2.5 text-sm">
            <span className="text-foreground">
              {tr("กำลังแสดงเฉพาะ")}{onlyOverdue ? tr("งานที่เลยกำหนด") : tr("งานที่ยังค้าง")}{who && <>{tr("ของ")}{" "}<b className="font-semibold">{who.name}</b></>}{labelFilter && <>{" "}{tr("ป้าย")}{" "}<b className="font-semibold">{labelFilter.name}</b></>}{q && <>{" "}{tr("ที่ตรงกับ")}{" "}<b className="font-semibold">&quot;{q}&quot;</b></>} · {tr("{0} งาน", [shown.length])}
            </span>
            <Link href={all} className="font-medium text-primary hover:text-primary-strong">{tr("ดูงานทั้งหมด")}</Link>
          </div>
        )}

        {filtered && shown.length === 0 ? (
          finishedShown.length === 0 && <p className="card text-sm text-muted-foreground">{q ? tr("ไม่พบงานที่ตรงกับคำค้น") : tr("ไม่มีงานที่ตรงกับตัวกรองนี้")}</p>
        ) : open.length === 0 ? (
          <EmptyState title={tr("ไม่มีงานค้าง")} description={shared ? tr("เพิ่มงานจากช่องด้านบน งานของคุณจะไปขึ้นในหน้าเช็กอินด้วย") : tr("พิมพ์ชื่องานในช่องด้านบนแล้วกด Enter เพื่อเริ่มรายการของคุณ")} />
        ) : (
          groups.map((g) => (
            <section key={g.id} data-tour="task-group" className="card">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2.5 text-sm font-semibold text-foreground">{shared && <Avatar user={g.person} size={24} />}{g.name}</h2>
                <span className="badge badge-neutral">{tr("{0} งาน", [g.tasks.length])}</span>
              </div>
              <ul className="divide-y divide-border">{g.tasks.map(renderTask)}</ul>
            </section>
          ))
        )}

        {finishedShown.length > 0 && (
          <details key={q} className="card" open={q ? true : selected ? selected.progress >= 100 : undefined}>
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">{tr("เสร็จแล้ว (")}{finishedShown.length})</summary>
            <ul className="mt-2 divide-y divide-border">{finishedShown.slice(0, 30).map(renderTask)}</ul>
          </details>
        )}
      </div>

      {selected && (
        <>
          {/* ฉากหลัง: กดเพื่อปิดแผง */}
          <Link href={base} scroll={false} aria-label={tr("ปิดรายละเอียดงาน")} className="fixed inset-0 z-40 hidden bg-foreground/20 lg:block" />
          <aside aria-label={tr("รายละเอียดงาน {0}", [selected.title])} className="fixed inset-0 z-50 overflow-y-auto bg-surface shadow-overlay lg:inset-y-0 lg:left-auto lg:w-[30rem] lg:border-l lg:border-border">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur sm:px-5">
              <Link href={base} scroll={false} className="btn-ghost min-h-9 gap-1 px-2.5 py-1 text-sm">← <span className="lg:hidden">{tr("กลับ")}</span><span className="max-lg:hidden">{tr("ปิด")}</span></Link>
              <span className="text-sm tabular-nums text-subtle">{selected.number !== null && `#${selected.number}`}</span>
              {canDelete(selected) ? <DeleteTaskButton id={selected.id} title={selected.title} /> : <span className="w-8" />}
            </div>
            <div className="space-y-6 px-4 py-5 pb-28 sm:px-5 lg:pb-8">
              {(() => {
                const view = (
                  <div>
                    <h2 className={`text-xl font-semibold leading-snug ${selected.progress >= 100 ? "text-muted-foreground line-through" : "text-foreground"}`}>{selected.title}</h2>
                    {selected.description && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground"><LinkedText text={selected.description} ctx={ctx} /></p>}
                  </div>
                );
                return canEditText(selected) ? (
                  <TaskEdit
                    teamId={team.id}
                    key={`${selected.id}:${selected.updatedAt.getTime()}`}
                    task={{ id: selected.id, title: selected.title, description: selected.description, assigneeId: selected.assignee.id }}
                    members={canReassign(selected) ? members.map((m) => m.user) : null}
                    selfId={user.id}
                    view={view}
                  />
                ) : (
                  view
                );
              })()}

              <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 text-sm">
                {shared && (
                  <>
                    <dt className="text-muted-foreground">{tr("ผู้รับงาน")}</dt>
                    <dd className="flex items-center gap-2"><Avatar user={selected.assignee} size={24} />{selected.assignee.name}</dd>
                  </>
                )}
                {selected.createdBy && selected.createdBy.id !== selected.assignee.id && (
                  <>
                    <dt className="text-muted-foreground">{tr("มอบหมายโดย")}</dt>
                    <dd>{selected.createdBy.name}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">{tr("กำหนดส่ง")}</dt>
                <dd>
                  {canUpdate(selected) ? (
                    <div className="[&>form]:justify-start"><DueForm id={selected.id} title={selected.title} dueDate={selected.dueDate ? dateToKey(selected.dueDate) : null} /></div>
                  ) : selected.dueDate ? (
                    formatDateKey(dateToKey(selected.dueDate))
                  ) : (
                    <span className="text-subtle">{tr("ยังไม่กำหนด")}</span>
                  )}
                </dd>
                <dt className="text-muted-foreground">{tr("ป้าย")}</dt>
                <dd><LabelPicker taskId={selected.id} teamId={team.id} labels={labels} selected={selected.labels.map((l) => l.labelId)} canEdit={canEditText(selected)} /></dd>
                {(selected.parentId || (canEditText(selected) && childrenOf(selected.id).length === 0)) && (
                  <>
                    <dt className="text-muted-foreground">{tr("งานแม่")}</dt>
                    <dd className="space-y-1">
                      {selected.parentId && byId.get(selected.parentId) && (
                        <Link href={`${base}&task=${byId.get(selected.parentId)!.number}`} scroll={false} className="block font-medium text-primary hover:text-primary-strong">#{byId.get(selected.parentId)!.number} {byId.get(selected.parentId)!.title}</Link>
                      )}
                      {canEditText(selected) && (
                        <ParentPicker
                          taskId={selected.id}
                          parent={selected.parentId ? { id: selected.parentId, number: byId.get(selected.parentId)?.number ?? null, title: byId.get(selected.parentId)?.title ?? "" } : null}
                          candidates={tasks.filter((t) => t.id !== selected.id && !t.parentId).map((t) => ({ id: t.id, number: t.number, title: t.title }))}
                        />
                      )}
                    </dd>
                  </>
                )}
              </dl>

              {!selected.parentId && (childrenOf(selected.id).length > 0 || canEditText(selected)) && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">{tr("งานย่อย")}{childrenOf(selected.id).length > 0 && ` ${childrenOf(selected.id).filter((c) => c.progress >= 100).length}/${childrenOf(selected.id).length}`}</h3>
                  {childrenOf(selected.id).length > 0 && (
                    <ul className="mb-2 space-y-1">
                      {childrenOf(selected.id).map((c) => (
                        <li key={c.id}>
                          <Link href={`${base}&task=${c.number}`} scroll={false} className="flex items-center gap-2 py-1 text-sm hover:text-primary">
                            <ProgressRing value={c.progress} size={18} />
                            <span className="tabular-nums text-subtle">#{c.number}</span>
                            <span className={`min-w-0 flex-1 truncate ${c.progress >= 100 ? "text-subtle line-through" : "text-foreground"}`}>{c.title}</span>
                            {shared && <span className="shrink-0 text-xs text-muted-foreground">{c.assignee.name}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEditText(selected) && <AddSubtask parentId={selected.id} members={canManage && shared ? members.map((m) => m.user) : null} selfId={user.id} />}
                </section>
              )}

              {(() => {
                const blockers = selected.blockedBy.flatMap((b) => byId.get(b.blockedById) ?? []);
                const blocks = tasks.filter((t) => t.blockedBy.some((b) => b.blockedById === selected.id));
                if (blockers.length === 0 && blocks.length === 0 && !canEditText(selected)) return null;
                const taken = new Set([selected.id, ...blockers.map((b) => b.id)]);
                return (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">{tr("ต้องรองาน")}</h3>
                    {blockers.length > 0 ? (
                      <ul className="mb-2 space-y-1">
                        {blockers.map((b) => (
                          <li key={b.id}>
                            <Link href={`${base}&task=${b.number}`} scroll={false} className="flex items-center gap-2 py-1 text-sm hover:text-primary">
                              <ProgressRing value={b.progress} size={18} />
                              <span className="tabular-nums text-subtle">#{b.number}</span>
                              <span className={`min-w-0 flex-1 truncate ${b.progress >= 100 ? "text-subtle line-through" : "text-foreground"}`}>{b.title}</span>
                              <span className={`badge shrink-0 text-2xs ${b.progress >= 100 ? "badge-success" : "badge-warning"}`}>{b.progress >= 100 ? tr("เสร็จแล้ว") : tr("ยังไม่เสร็จ")}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mb-2 text-sm text-subtle">{tr("ไม่ต้องรองานไหน")}</p>
                    )}
                    {canEditText(selected) && (
                      <WaitingEditor
                        taskId={selected.id}
                        blockers={blockers.map((b) => ({ id: b.id, number: b.number, title: b.title }))}
                        candidates={tasks.filter((t) => !taken.has(t.id) && t.progress < 100).map((t) => ({ id: t.id, number: t.number, title: t.title }))}
                      />
                    )}
                    {blocks.length > 0 && (
                      <>
                        <h4 className="mb-1 mt-3 text-xs font-semibold text-muted-foreground">{tr("งานที่รองานนี้อยู่")}</h4>
                        <ul className="space-y-1">
                          {blocks.map((b) => (
                            <li key={b.id}><Link href={`${base}&task=${b.number}`} scroll={false} className="flex gap-2 text-sm hover:text-primary"><span className="tabular-nums text-subtle">#{b.number}</span><span className="min-w-0 truncate">{b.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{b.assignee.name}</span></Link></li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                );
              })()}

              <section>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ProgressRing value={selected.progress} size={22} />{tr("ความคืบหน้า")}{" "}{selected.progress}%</h3>
                {canUpdate(selected) ? (
                  <form action={setTaskProgress} className="space-y-2">
                    <input type="hidden" name="id" value={selected.id} />
                    <ProgressSlider key={`${selected.id}:${selected.progress}`} defaultValue={selected.progress} label={tr("ความคืบหน้าของ {0} (%)", [selected.title])} />
                    <div className="flex items-center gap-2">
                      <input name="reason" maxLength={500} placeholder={tr("เหตุผล / หมายเหตุ (ไม่บังคับ)")} aria-label={tr("เหตุผลของการอัปเดต")} className="input flex-1 py-2 text-sm" />
                      <button className="btn shrink-0">{tr("บันทึก")}</button>
                    </div>
                    <p className="text-xs text-muted-foreground">{tr("การเปลี่ยนแปลงและเหตุผลจะถูกบันทึกไว้ในความคิดเห็นด้านล่าง")}</p>
                  </form>
                ) : (
                  <p className="text-sm text-muted-foreground">{tr("อัปเดตได้เฉพาะผู้รับงานหรือหัวหน้าทีม")}</p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">{tr("ไฟล์แนบ")}</h3>
                <AttachmentList files={toFileItems(selected.attachments, user.id)} canModerate={canManage} />
                {toFileItems(selected.attachments, user.id).length === 0 && <p className="text-sm text-subtle">{tr("ยังไม่มีไฟล์")}</p>}
                {canAttach && (canUpdate(selected) || selected.createdBy?.id === user.id) && <AttachButton target={{ taskId: selected.id }} />}
              </section>

              {(selected.noteLinks.length > 0 || backlinks.length > 0) && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">{tr("ถูกอ้างถึงใน")}</h3>
                  <ul className="space-y-1">
                    {selected.noteLinks.map((l) => (
                      <li key={l.from.id}><Link href={`/notes/${l.from.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-strong"><Icon name="note" className="h-4 w-4 text-subtle" />{l.from.title}</Link></li>
                    ))}
                    {backlinks.map((b) => (
                      <li key={b.key}>
                        <Link href={b.href} scroll={false} className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary">
                          <Icon name={b.icon} className="h-4 w-4 shrink-0 text-subtle" />
                          <span className="min-w-0 truncate">{b.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-1 text-sm font-semibold">{tr("ความคิดเห็นและประวัติ")}</h3>
                <CommentThread teamId={team.id} canAttach={canAttach} target={{ taskId: selected.id }} comments={selected.comments} viewerId={user.id} canModerate={canManage} subject={selected.title} open />
              </section>
            </div>
          </aside>
        </>
      )}
    </UndoDeleteProvider>
  );
}
