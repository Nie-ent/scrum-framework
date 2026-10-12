import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, keyToDate, todayKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { carryOver, toTasks, type Task } from "@/lib/tasks";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";
import { StandupForm } from "./standup-form";
import { NavGlyph } from "@/components/nav-icons";
import { GettingStarted } from "@/components/getting-started";
import { ProgressRing } from "@/components/progress-ring";
import { Tooltip } from "@/components/tooltip";
import { setTaskProgress } from "@/app/actions/tasks";
import { Avatar } from "@/components/avatar";
import { CommentThread } from "@/components/comments";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { getManageableTeamIds, getMeetingUrl } from "@/lib/teams";
import { currentSpaceId, pickSpace } from "@/lib/space";
import { Icon } from "@/components/icons";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("วันนี้") };
}

export default async function StandupPage({ searchParams }: PageProps<"/standup">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();
  // ทีมที่ต้องเช็กอิน — ไม่รวมทีมที่อยู่ในฐานะผู้ดูแลอย่างเดียว
  const teams = user.memberships.filter((m) => m.participates).map((m) => m.team);

  if (teams.length === 0) {
    return (
      <EmptyState
        title={tr("คุณยังไม่ได้อยู่ในทีมไหน")}
        description={tr("เช็กอินส่งแยกตามทีม — สร้างทีมของคุณ หรือรับคำเชิญเข้าทีมก่อน")}
        action={{ href: "/teams", label: tr("ไปหน้า ทีม") }}
      />
    );
  }

  // คนที่อยู่หลายทีมเขียน scrum แยกกันต่อทีม
  let team = (await pickSpace(teams, params.team))!;
  // พื้นที่ที่เลือกไว้เป็นทีมย่อยที่ตัวเองไม่ได้เช็กอิน (เช่น หัวหน้าทีมแม่) → ใช้ทีมแม่ที่ตัวเองเช็กอินอยู่
  const wanted = typeof params.team === "string" ? params.team : await currentSpaceId();
  if (wanted && wanted !== team.id) {
    const chosen = await prisma.team.findUnique({ where: { id: wanted }, select: { parentId: true } });
    team = teams.find((t) => t.id === chosen?.parentId) ?? team;
  }
  // พื้นที่ส่วนตัว: ใช้ฟอร์มเดียวกันเป็นบันทึกประจำวันของตัวเอง (ไม่มีส่วนของเพื่อนร่วมทีม)
  const personal = Boolean(team.personalOfId);
  const [history, myTasks, teammates, manageableIds, meetingUrl, dueNow] = await Promise.all([
    prisma.standup.findMany({
      where: { userId: user.id, teamId: team.id },
      include: { comments: withComments },
      orderBy: { date: "desc" },
      // ต้องใช้แค่ของวันนี้กับครั้งก่อนหน้า (ยกงานมา) — ประวัติทั้งหมดอยู่ที่ /standup/history
      take: 2,
    }),
    // งานที่ได้รับมอบหมายในทีมนี้ (รวมที่เสร็จแล้ว เพื่อใช้ตรวจ taskId ในเช็กอินเก่า)
    prisma.task.findMany({
      where: { assigneeId: user.id, teamId: team.id, deletedAt: null },
      select: { id: true, title: true, progress: true, createdById: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    // เช็กอินวันนี้ของเพื่อนร่วมทีม
    prisma.standup.findMany({
      where: { teamId: team.id, date: keyToDate(today), userId: { not: user.id }, user: { active: true } },
      include: { user: { select: { id: true, name: true, avatarUpdatedAt: true } }, comments: withComments },
      orderBy: { user: { name: "asc" } },
    }),
    getManageableTeamIds(user),
    getMeetingUrl(team.id),
    // "วันนี้" ของฉัน: งานที่ถึงกำหนดหรือเลยกำหนดแล้ว จากทุกพื้นที่ที่ฉันอยู่
    prisma.task.findMany({
      where: { assigneeId: user.id, deletedAt: null, progress: { lt: 100 }, dueDate: { lte: keyToDate(today) } },
      select: { id: true, title: true, progress: true, dueDate: true, number: true, teamId: true, team: { select: { name: true, personalOfId: true } } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      take: 20,
    }),
  ]);
  const canModerate = manageableIds.has(team.id);
  const canAttach = isFileStorageConfigured();
  const taskById = new Map(myTasks.map((t) => [t.id, t]));
  // บรรทัดที่อ้างถึงงาน: ใช้ชื่อและ % ล่าสุดของงานนั้น (งานคือแหล่งความจริงของ %) — งานที่ถูกลบไปแล้วกลายเป็นบรรทัดธรรมดา
  const syncLinked = (tasks: Task[], useTaskProgress: boolean): Task[] =>
    tasks.map(({ taskId, ...rest }) => {
      const linked = taskId ? taskById.get(taskId) : undefined;
      if (!linked) return rest;
      // งานที่ตัวเองสร้าง (รวมที่พิมพ์ในเช็กอิน) แก้ชื่อได้ — งานที่คนอื่นมอบหมายแก้ได้เฉพาะ %
      return { ...rest, taskId, text: linked.title, ...(useTaskProgress ? { progress: linked.progress } : {}), ...(linked.createdById === user.id ? { editable: true } : {}) };
    });
  const current = history.find((s) => dateToKey(s.date) === today);
  const previous = history.find((s) => s.date < keyToDate(today));

  return (
    <div className="mx-auto max-w-4xl">
      <section>
        <div className="page-header mb-6">
          <div>
            <p className="eyebrow">{team.name}</p>
            <h1 className="page-title">{tr("วันนี้")}</h1>
            <p className="page-subtitle">{formatDateKey(today)} · {current ? tr("ส่งแล้ว และแก้ไขได้ตลอดวัน") : tr("ยังไม่ได้ส่งของวันนี้")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {meetingUrl && (
              <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="btn gap-1.5"><Icon name="video" />{tr("เข้าห้องประชุม")}</a>
            )}
            <Link href={`/stats?team=${team.id}`} className="btn-ghost gap-1.5"><NavGlyph icon="stats" className="h-4 w-4 text-indigo-600" />{tr("สถิติของฉัน")}</Link>
          </div>
        </div>

        <GettingStarted spaceId={team.id} personal={personal} />

        {/* งานที่ถึงกำหนดวันนี้หรือเลยกำหนดแล้ว — สิ่งแรกที่ควรเห็นตอนเปิดแอป */}
        {dueNow.length > 0 && (
          <section className="card mb-4 border-warning/30 bg-warning-soft/40">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">{tr("งานที่ต้องทำวันนี้")}</h2>
              <span className="badge badge-warning">{tr("{0} งาน", [dueNow.length])}</span>
            </div>
            <ul className="divide-y divide-border/70">
              {dueNow.map((t) => {
                const key = dateToKey(t.dueDate!);
                return (
                  <li key={t.id} className="flex items-center gap-2.5 py-1.5">
                    <form action={setTaskProgress} className="shrink-0">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="progress" value={100} />
                      <Tooltip label={tr("ทำเสร็จแล้ว (100%)")}>
                        <button aria-label={tr("ทำงาน {0} เสร็จแล้ว", [t.title])} className="flex size-9 items-center justify-center rounded-full transition hover:bg-success-soft"><ProgressRing value={t.progress} /></button>
                      </Tooltip>
                    </form>
                    <Link href={`/tasks?team=${t.teamId}${t.number === null ? "" : `&task=${t.number}`}`} className="flex min-w-0 flex-1 items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{t.title}<span className="ml-2 text-xs font-normal text-subtle">{t.team.personalOfId ? tr("ส่วนตัว") : t.team.name}</span></span>
                      <span className={`badge shrink-0 ${key < today ? "badge-danger" : "badge-warning"}`}>{key < today ? tr("เลยกำหนด {0}", [formatDateKey(key).replace(/ \d{4}$/, "")]) : tr("วันนี้")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <h2 id="checkin" className="mb-2 scroll-mt-24 text-sm font-semibold text-foreground">{personal ? tr("บันทึกประจำวัน") : tr("เช็กอินประจำวัน")}</h2>

        <StandupForm
          key={team.id}
          teamId={team.id}
          teamName={team.name}
          initial={{
            yesterdayTasks: current
              ? syncLinked(toTasks(current.yesterdayTasks), true)
              : syncLinked(carryOver(toTasks(previous?.todayTasks)), true),
            todayTasks: current ? syncLinked(toTasks(current.todayTasks), false) : [],
            blockers: current?.blockers ?? "",
            notWorking: current?.notWorking ?? "",
            workingWell: current?.workingWell ?? "",
          }}
          carriedOver={!current && Boolean(previous)}
          submitted={Boolean(current)}
          assigned={myTasks.filter((t) => t.progress < 100).map((t) => ({ id: t.id, title: t.title, progress: t.progress, editable: t.createdById === user.id }))}
        />

        {current && (
          <div className="mt-3">
            <CommentThread canAttach={canAttach} target={{ standupId: current.id }} comments={current.comments} viewerId={user.id} canModerate={canModerate} subject={tr("เช็กอินวันนี้ของฉัน")} open={current.comments.length > 0} />
          </div>
        )}

        {!personal && <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">{tr("ทีมวันนี้")}</p>
              <h2 className="font-semibold text-slate-900">{tr("เช็กอินของทีมวันนี้ ·")}{" "}{team.name}</h2>
            </div>
            <span className="badge badge-neutral">{tr("{0} คน", [teammates.length])}</span>
          </div>
          {teammates.length === 0 ? (
            <p className="text-sm text-slate-500">{tr("ยังไม่มีเพื่อนร่วมทีมเช็กอินวันนี้")}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {teammates.map((s) => (
                <article key={s.id} className="card flex flex-col gap-3">
                  <header className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar user={s.user} size={32} />
                      <span className="truncate font-semibold text-slate-800">{s.user.name}</span>
                    </div>
                    {s.blockers && <span className="badge badge-danger shrink-0">{tr("ต้องการความช่วยเหลือ")}</span>}
                  </header>
                  {/* เพื่อนร่วมทีมเห็นงานและ blocker — ส่วน reflection เห็นเฉพาะหัวหน้าในหน้าภาพรวม */}
                  <StandupSections standup={s} only={["yesterdayTasks", "todayTasks", "blockers"]} />
                  <CommentThread canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={user.id} canModerate={canModerate} subject={tr("เช็กอินของ {0}", [s.user.name])} />
                </article>
              ))}
            </div>
          )}
        </section>}
      </section>

    </div>
  );
}
