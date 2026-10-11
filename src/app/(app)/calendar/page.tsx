import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { EmptyState } from "@/components/ui-state";
import { DueForm } from "./due-form";
import { dayTone, holidayName } from "@/lib/holidays";

export const metadata: Metadata = { title: "ปฏิทินงาน" };

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const monthLabel = (key: string) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(keyToDate(`${key}-01`));
const shiftMonth = (key: string, by: number) => {
  const d = keyToDate(`${key}-01`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return dateToKey(d).slice(0, 7);
};

/** ปฏิทินงานรายเดือนตามกำหนดส่ง — จอใหญ่เป็นตาราง, ทุกจอมีรายการเรียงตามวันให้เลื่อนกำหนดได้ */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title="ยังไม่มีพื้นที่ทำงาน" description="ลองโหลดหน้าใหม่อีกครั้ง" />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const canManage = manageableIds.has(team.id);
  const month = typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);

  // ตารางเริ่มวันอาทิตย์ของสัปดาห์แรก ถึงวันเสาร์ของสัปดาห์สุดท้ายของเดือน
  const first = `${month}-01`;
  const last = shiftKey(`${shiftMonth(month, 1)}-01`, -1);
  const gridStart = shiftKey(first, -keyToDate(first).getUTCDay());
  const gridEnd = shiftKey(last, 6 - keyToDate(last).getUTCDay());
  const days: string[] = [];
  for (let key = gridStart; key <= gridEnd; key = shiftKey(key, 1)) days.push(key);

  const select = { id: true, number: true, title: true, progress: true, dueDate: true, assigneeId: true, assignee: { select: { name: true } } } as const;
  const [scheduled, unscheduled] = await Promise.all([
    prisma.task.findMany({
      where: { teamId: team.id, deletedAt: null, dueDate: { gte: keyToDate(gridStart), lte: keyToDate(gridEnd) } },
      select,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.task.findMany({
      where: { teamId: team.id, deletedAt: null, dueDate: null, progress: { lt: 100 } },
      select,
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  type Row = (typeof scheduled)[number];
  const byDay = new Map<string, Row[]>();
  for (const t of scheduled) {
    const key = dateToKey(t.dueDate!);
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const inMonth = scheduled.filter((t) => dateToKey(t.dueDate!).startsWith(month));
  const canEdit = (t: Row) => canManage || t.assigneeId === user.id;
  const shared = !team.personalOfId;
  const tone = (t: Row, key: string) =>
    t.progress >= 100 ? "bg-emerald-50 text-emerald-700 line-through decoration-emerald-400" : key < today ? "bg-rose-50 text-rose-700" : t.assigneeId === user.id ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-700";
  const href = (m: string, teamId = team.id) => `/calendar?team=${teamId}&month=${m}`;
  const taskHref = (t: Row) => `/tasks?team=${team.id}${t.number === null ? "" : `&task=${t.number}`}`;

  const TaskLine = ({ t }: { t: Row }) => (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <Link href={taskHref(t)} className="min-w-0 flex-1 basis-56 text-sm text-slate-800 hover:text-indigo-700">
        {t.number !== null && <span className="mr-1.5 tabular-nums text-slate-400">#{t.number}</span>}
        <span className={t.progress >= 100 ? "text-slate-400 line-through" : "font-medium"}>{t.title}</span>
        <span className="ml-2 text-xs text-slate-500">
          {t.progress}%{shared && ` · ${t.assigneeId === user.id ? "ของฉัน" : t.assignee.name}`}
        </span>
      </Link>
      {canEdit(t) && <DueForm id={t.id} title={t.title} dueDate={t.dueDate ? dateToKey(t.dueDate) : null} />}
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">ตารางงาน</p>
          <h1 className="page-title">ปฏิทินงาน</h1>
          <p className="page-subtitle">{team.name} · {monthLabel(month)} · {inMonth.length} งานที่มีกำหนดส่งเดือนนี้</p>
        </div>
        <div className="card flex items-center gap-2 p-2">
          <Link className="btn-ghost" href={href(shiftMonth(month, -1))} aria-label="เดือนก่อนหน้า">←</Link>
          <Link className="btn-ghost" href={href(today.slice(0, 7))}>เดือนนี้</Link>
          <Link className="btn-ghost" href={href(shiftMonth(month, 1))} aria-label="เดือนถัดไป">→</Link>
          <Link className="btn" href={`/tasks?team=${team.id}#new`}>+ เพิ่มงาน</Link>
        </div>
      </div>


      {/* ตารางเดือน — จอเล็กใช้รายการด้านล่างแทน */}
      <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:block" aria-label={`ปฏิทิน ${monthLabel(month)}`}>
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {WEEKDAYS.map((d, i) => <div key={d} className={`py-2 ${i === 0 || i === 6 ? "text-danger" : ""}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((key) => {
            const tasks = byDay.get(key) ?? [];
            const outside = !key.startsWith(month);
            return (
              <div key={key} className={`group/day min-h-28 border-b border-r border-slate-100 p-1.5 [&:nth-child(7n)]:border-r-0 ${outside ? "bg-slate-50/60" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums ${key === today ? "bg-indigo-600 font-semibold text-white" : outside ? `${dayTone(key)} opacity-40` : dayTone(key)}`}>{Number(key.slice(8))}</span>
                  {holidayName(key) && <span title={holidayName(key)} className={`mx-1 min-w-0 flex-1 truncate text-2xs font-medium text-sky-600 ${outside ? "opacity-40" : ""}`}>{holidayName(key)}</span>}
                  {key >= today && (
                    <Link href={`/tasks?team=${team.id}&due=${key}#new`} aria-label={`เพิ่มงานกำหนดส่ง ${formatDateKey(key)}`} title="เพิ่มงานในวันนี้" className="rounded px-1 text-sm leading-none text-slate-300 opacity-0 transition hover:text-indigo-600 focus:opacity-100 group-hover/day:opacity-100">+</Link>
                  )}
                </div>
                <ul className="space-y-1">
                  {tasks.slice(0, 3).map((t) => (
                    <li key={t.id}>
                      <Link href={taskHref(t)} title={`${t.title} · ${t.progress}%${shared ? ` · ${t.assignee.name}` : ""}`} className={`block truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:brightness-95 ${tone(t, key)}`}>{t.title}</Link>
                    </li>
                  ))}
                  {tasks.length > 3 && <li className="px-1.5 text-xs text-slate-400">+ อีก {tasks.length - 3} งาน</li>}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-indigo-200" />งานของฉัน</span>
          {shared && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-slate-300" />งานของคนอื่น</span>}
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-200" />เลยกำหนด</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-200" />เสร็จแล้ว</span>
          <span className="font-medium text-danger">เสาร์–อาทิตย์</span>
          <span className="font-medium text-sky-600">วันหยุดนักขัตฤกษ์</span>
          <span>ชี้ที่วันแล้วกด + เพื่อเพิ่มงานในวันนั้น</span>
        </p>
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold text-slate-900">งานเดือนนี้ เรียงตามวัน</h2>
        {inMonth.length === 0 ? (
          <p className="text-sm text-slate-500">ยังไม่มีงานที่กำหนดส่งในเดือนนี้ — เพิ่มงานแล้วใส่กำหนดส่ง หรือกำหนดวันให้งานด้านล่าง</p>
        ) : (
          [...new Set(inMonth.map((t) => dateToKey(t.dueDate!)))].map((key) => (
            <div key={key} className="border-t border-slate-100 py-2 first:border-t-0">
              <h3 className={`text-xs font-semibold ${key === today ? "text-indigo-700" : key < today ? "text-slate-400" : "text-slate-600"}`}>
                {formatDateKey(key)}{key === today && " · วันนี้"}{holidayName(key) && <span className="ml-1.5 font-medium text-sky-600">{holidayName(key)}</span>}
              </h3>
              <ul className="divide-y divide-slate-50">{byDay.get(key)!.map((t) => <TaskLine key={t.id} t={t} />)}</ul>
            </div>
          ))
        )}
      </section>

      {unscheduled.length > 0 && (
        <section className="card">
          <h2 className="font-semibold text-slate-900">งานที่ยังไม่มีกำหนดส่ง ({unscheduled.length})</h2>
          <p className="mb-1 text-sm text-slate-500">เลือกวันแล้วกดบันทึก งานจะขึ้นในปฏิทิน</p>
          <ul className="divide-y divide-slate-100">{unscheduled.map((t) => <TaskLine key={t.id} t={t} />)}</ul>
        </section>
      )}
    </div>
  );
}
