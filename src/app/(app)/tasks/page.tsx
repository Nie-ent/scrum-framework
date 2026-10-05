import Link from "next/link";
import type { Metadata } from "next";
import { deleteTask, setTaskProgress } from "@/app/actions/tasks";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey, todayKey } from "@/lib/dates";
import { getVisibleTeams, sortTeamTree } from "@/lib/teams";
import { ProgressBar } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";
import { TaskForm } from "./task-form";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "งาน" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();

  // ทีมที่เข้าหน้านี้ได้ = ทีมที่ตัวเองอยู่ + ทีมที่ดูแล (หัวหน้าทีม/ทีมแม่, Manager ขึ้นไป)
  const manageable = await getVisibleTeams(user);
  const manageableIds = new Set(manageable.map((t) => t.id));
  const teams = sortTeamTree([
    ...manageable,
    ...user.memberships.map((m) => m.team).filter((t) => !manageableIds.has(t.id)),
  ]);
  if (teams.length === 0) {
    return <EmptyState title="คุณยังไม่ได้อยู่ในทีมไหน" description="งานจะถูกมอบหมายภายในทีม — ติดต่อผู้ดูแลระบบให้เพิ่มคุณเข้าทีมก่อน" />;
  }
  const team = teams.find((t) => t.id === params.team) ?? teams.find((t) => user.memberships.some((m) => m.teamId === t.id)) ?? teams[0];
  const canManage = manageableIds.has(team.id);

  const [members, tasks] = await Promise.all([
    canManage
      ? prisma.teamMember.findMany({
          where: { teamId: team.id, user: { active: true } },
          select: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : Promise.resolve([]),
    prisma.task.findMany({
      // หัวหน้าทีมเห็นงานของทุกคนในทีม — สมาชิกเห็นงานของตัวเอง
      where: { teamId: team.id, ...(canManage ? {} : { assigneeId: user.id }) },
      include: { assignee: { select: { id: true, name: true, avatarUpdatedAt: true } }, createdBy: { select: { id: true, name: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
  ]);

  const open = tasks.filter((t) => t.progress < 100);
  const finished = tasks.filter((t) => t.progress >= 100).sort((a, b) => (b.doneAt?.getTime() ?? 0) - (a.doneAt?.getTime() ?? 0));
  const overdue = open.filter((t) => t.dueDate && dateToKey(t.dueDate) < today).length;

  // หัวหน้าทีม: จัดกลุ่มตามคน — สมาชิก: กลุ่มเดียว
  const groups = canManage
    ? [...new Map(open.map((t) => [t.assignee.id, t.assignee])).values()].map((assignee) => ({
        id: assignee.id,
        name: assignee.name,
        person: assignee,
        tasks: open.filter((t) => t.assignee.id === assignee.id),
      }))
    : [{ id: user.id, name: "งานของฉัน", person: user, tasks: open }];

  type TaskRow = (typeof tasks)[number];
  const canDelete = (t: TaskRow) => canManage || (t.assignee.id === user.id && t.createdBy?.id === user.id);
  const canUpdate = (t: TaskRow) => canManage || t.assignee.id === user.id;

  const renderTask = (t: TaskRow) => {
    const dueKey = t.dueDate ? dateToKey(t.dueDate) : null;
    const late = dueKey !== null && dueKey < today && t.progress < 100;
    return (
      <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className={`font-medium ${t.progress >= 100 ? "text-slate-400 line-through" : "text-slate-800"}`}>{t.title}</p>
          {t.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-500">{t.description}</p>}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {dueKey && <span className={`badge ${late ? "badge-danger" : "badge-neutral"}`}>{late ? "เลยกำหนด · " : "ส่ง "}{formatDateKey(dueKey)}</span>}
            {t.createdBy && t.createdBy.id !== t.assignee.id && <span>มอบหมายโดย {t.createdBy.name}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ProgressBar percent={t.progress} className="w-20" />
          {canUpdate(t) ? (
            <form action={setTaskProgress} className="flex items-center gap-1">
              <input type="hidden" name="id" value={t.id} />
              <input name="progress" type="number" inputMode="numeric" min={0} max={100} step={5} defaultValue={t.progress} aria-label={`ความคืบหน้าของ ${t.title} (%)`} className="input w-16 px-2 py-1.5 text-right tabular-nums" />
              <span className="text-xs text-slate-500">%</span>
              <button className="btn-ghost min-h-9 px-2.5 py-1 text-xs">บันทึก</button>
            </form>
          ) : (
            <span className="text-xs font-semibold tabular-nums text-slate-600">{t.progress}%</span>
          )}
          {canDelete(t) && (
            <form action={deleteTask}>
              <input type="hidden" name="id" value={t.id} />
              <button aria-label={`ลบงาน ${t.title}`} title="ลบงาน" className="rounded-lg px-2 py-1 text-slate-400 transition hover:text-rose-600">×</button>
            </form>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">Team tasks</p>
          <h1 className="page-title">งาน</h1>
          <p className="page-subtitle">
            {team.name} · ค้างอยู่ {open.length} งาน
            {overdue > 0 && <span className="text-rose-600"> · เลยกำหนด {overdue}</span>}
          </p>
        </div>
      </div>

      {teams.length > 1 && (
        <nav aria-label="เลือกทีม" className="flex flex-wrap gap-1 rounded-2xl bg-slate-100 p-1">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/tasks?team=${t.id}`}
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

      <section className="card">
        <div className="mb-4">
          <p className="eyebrow">{canManage ? "Assign" : "New task"}</p>
          <h2 className="font-semibold text-slate-900">{canManage ? "มอบหมายงานให้สมาชิก" : "เพิ่มงานของฉัน"}</h2>
        </div>
        <TaskForm key={team.id} teamId={team.id} selfId={user.id} members={canManage ? members.map((m) => m.user) : null} today={today} />
      </section>

      {open.length === 0 ? (
        <EmptyState title="ไม่มีงานค้าง" description={canManage ? "มอบหมายงานให้สมาชิกจากฟอร์มด้านบน งานจะไปขึ้นในเช็กอินของคนนั้น" : "เมื่อหัวหน้าทีมมอบหมายงาน งานจะแสดงที่นี่และในหน้าเช็กอิน"} />
      ) : (
        groups.map((g) => (
          <section key={g.id} className="card">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2.5 font-semibold text-slate-900"><Avatar user={g.person} size={28} />{g.name}</h2>
              <span className="badge badge-neutral">{g.tasks.length} งาน</span>
            </div>
            <ul className="divide-y divide-slate-100">{g.tasks.map(renderTask)}</ul>
          </section>
        ))
      )}

      {finished.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">เสร็จแล้ว ({finished.length})</summary>
          <ul className="mt-2 divide-y divide-slate-100">
            {finished.slice(0, 30).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-500 line-through">{t.title}</span>
                <span className="text-xs text-slate-400">
                  {canManage && `${t.assignee.name} · `}
                  {t.doneAt ? formatDateKey(dateToKey(t.doneAt)) : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
