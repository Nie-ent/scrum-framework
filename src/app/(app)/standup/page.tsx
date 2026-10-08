import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey, keyToDate, todayKey } from "@/lib/dates";
import { carryOver, toTasks, type Task } from "@/lib/tasks";
import { StandupSections } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";
import { StandupForm } from "./standup-form";
import { Avatar } from "@/components/avatar";
import { CommentThread } from "@/components/comments";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { getManageableTeamIds } from "@/lib/teams";

export default async function StandupPage({ searchParams }: PageProps<"/standup">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();
  // ทีมที่ต้องเช็กอิน — ไม่รวมทีมที่อยู่ในฐานะผู้ดูแลอย่างเดียว
  const teams = user.memberships.filter((m) => m.participates).map((m) => m.team);

  if (teams.length === 0) {
    return (
      <EmptyState
        title="คุณยังไม่ได้อยู่ในทีมไหน"
        description="Daily Scrum ส่งแยกตามทีม — ติดต่อผู้ดูแลระบบให้เพิ่มคุณเข้าทีมก่อน"
      />
    );
  }

  // คนที่อยู่หลายทีมเขียน scrum แยกกันต่อทีม
  const team = teams.find((t) => t.id === params.team) ?? teams[0];
  const [history, submittedToday, myTasks, teammates, manageableIds] = await Promise.all([
    prisma.standup.findMany({
      where: { userId: user.id, teamId: team.id },
      include: { comments: withComments },
      orderBy: { date: "desc" },
      take: 15,
    }),
    prisma.standup.findMany({
      where: { userId: user.id, date: keyToDate(today) },
      select: { teamId: true },
    }),
    // งานที่ได้รับมอบหมายในทีมนี้ (รวมที่เสร็จแล้ว เพื่อใช้ตรวจ taskId ในเช็กอินเก่า)
    prisma.task.findMany({
      where: { assigneeId: user.id, teamId: team.id, deletedAt: null },
      select: { id: true, title: true, progress: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    // เช็กอินวันนี้ของเพื่อนร่วมทีม
    prisma.standup.findMany({
      where: { teamId: team.id, date: keyToDate(today), userId: { not: user.id }, user: { active: true } },
      include: { user: { select: { id: true, name: true, avatarUpdatedAt: true } }, comments: withComments },
      orderBy: { user: { name: "asc" } },
    }),
    getManageableTeamIds(user),
  ]);
  const canModerate = manageableIds.has(team.id);
  const canAttach = isFileStorageConfigured();
  const taskById = new Map(myTasks.map((t) => [t.id, t]));
  // บรรทัดที่อ้างถึงงาน: ใช้ชื่อและ % ล่าสุดของงานนั้น — งานที่ถูกลบไปแล้วกลายเป็นบรรทัดธรรมดา
  const syncLinked = (tasks: Task[], useTaskProgress: boolean): Task[] =>
    tasks.map(({ taskId, ...rest }) => {
      const linked = taskId ? taskById.get(taskId) : undefined;
      if (!linked) return rest;
      return { ...rest, taskId, text: linked.title, ...(useTaskProgress ? { progress: linked.progress } : {}) };
    });
  const doneTeams = new Set(submittedToday.map((s) => s.teamId));
  const current = history.find((s) => dateToKey(s.date) === today);
  const previous = history.find((s) => s.date < keyToDate(today));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="page-header mb-6">
          <div>
            <p className="eyebrow">Daily rhythm</p>
            <h1 className="page-title">Daily Scrum</h1>
            <p className="page-subtitle">{formatDateKey(today)} · {current ? "ส่งแล้ว และแก้ไขได้ตลอดวัน" : "ยังไม่ได้ส่งของวันนี้"}</p>
          </div>
        </div>

        {teams.length > 1 && (
          <nav aria-label="เลือกทีม" className="mb-4 flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
            {teams.map((t) => (
              <Link
                key={t.id}
                href={`/standup?team=${t.id}`}
                aria-current={t.id === team.id ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-sm transition ${
                  t.id === team.id ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {t.name}
                <span className={`h-1.5 w-1.5 rounded-full ${doneTeams.has(t.id) ? "bg-emerald-500" : "bg-amber-400"}`} aria-label={doneTeams.has(t.id) ? "ส่งแล้ว" : "ยังไม่ส่ง"} />
              </Link>
            ))}
          </nav>
        )}

        <StandupForm
          key={team.id}
          teamId={team.id}
          teamName={team.name}
          initial={{
            yesterdayTasks: current
              ? syncLinked(toTasks(current.yesterdayTasks), false)
              : syncLinked(carryOver(toTasks(previous?.todayTasks)), true),
            todayTasks: current ? syncLinked(toTasks(current.todayTasks), false) : [],
            blockers: current?.blockers ?? "",
            notWorking: current?.notWorking ?? "",
            workingWell: current?.workingWell ?? "",
          }}
          carriedOver={!current && Boolean(previous)}
          submitted={Boolean(current)}
          assigned={myTasks.filter((t) => t.progress < 100)}
        />

        {current && (
          <div className="mt-3">
            <CommentThread canAttach={canAttach} target={{ standupId: current.id }} comments={current.comments} viewerId={user.id} canModerate={canModerate} subject="เช็กอินวันนี้ของฉัน" open={current.comments.length > 0} />
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Team today</p>
              <h2 className="font-semibold text-slate-900">เช็กอินของทีมวันนี้ · {team.name}</h2>
            </div>
            <span className="badge badge-neutral">{teammates.length} คน</span>
          </div>
          {teammates.length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีเพื่อนร่วมทีมเช็กอินวันนี้</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {teammates.map((s) => (
                <article key={s.id} className="card flex flex-col gap-3">
                  <header className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar user={s.user} size={32} />
                      <span className="truncate font-semibold text-slate-800">{s.user.name}</span>
                    </div>
                    {s.blockers && <span className="badge badge-danger shrink-0">ต้องการความช่วยเหลือ</span>}
                  </header>
                  {/* เพื่อนร่วมทีมเห็นงานและ blocker — ส่วน reflection เห็นเฉพาะหัวหน้าในหน้าภาพรวม */}
                  <StandupSections standup={s} only={["yesterdayTasks", "todayTasks", "blockers"]} />
                  <CommentThread canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={user.id} canModerate={canModerate} subject={`เช็กอินของ ${s.user.name}`} />
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <aside className="xl:border-l xl:border-slate-200 xl:pl-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">ประวัติ · {team.name}</h2>
          <span className="badge badge-neutral">15 รายการล่าสุด</span>
        </div>
        <div className="space-y-3">
          {history.filter((s) => s !== current).map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-500"><span>{formatDateKey(dateToKey(s.date))}</span><span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="ส่งแล้ว" /></div>
              <StandupSections standup={s} />
              <div className="mt-2"><CommentThread canAttach={canAttach} target={{ standupId: s.id }} comments={s.comments} viewerId={user.id} canModerate={canModerate} subject={`เช็กอิน ${formatDateKey(dateToKey(s.date))}`} /></div>
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีประวัติในทีมนี้</p>}
        </div>
      </aside>
    </div>
  );
}
