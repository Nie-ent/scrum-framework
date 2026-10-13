import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, isDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { dayTone, holidayName } from "@/lib/holidays";
import { getWorkspaceTeams } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { LinkSelect } from "@/components/select";
import { EmptyState } from "@/components/ui-state";
import { DueForm } from "./due-form";
import { currentLocale, ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("ปฏิทินงาน") };
}

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const VIEWS = [["month", "เดือน"], ["week", "สัปดาห์"], ["day", "วัน"]] as const;
type View = (typeof VIEWS)[number][0];
const fmt = (key: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(currentLocale(), { ...options, timeZone: "UTC" }).format(keyToDate(key));
const monthLabel = (month: string) => fmt(`${month}-01`, { month: "long", year: "numeric" });
const shiftMonth = (month: string, by: number) => {
  const d = keyToDate(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return dateToKey(d).slice(0, 7);
};
const weekStart = (key: string) => shiftKey(key, -keyToDate(key).getUTCDay());

/**
 * ปฏิทินงานตามกำหนดส่ง — มุมมอง เดือน / สัปดาห์ / วัน
 * กดวันในมุมมองเดือน = ลงไปดูสัปดาห์นั้น · กดวันในมุมมองสัปดาห์ = ลงไปดูวันนั้น
 * จอใหญ่เป็นตาราง จอเล็กเป็นรายการเรียงตามวัน (หัวข้อวันกดลงไปชั้นถัดไปได้เหมือนกัน)
 */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();
  const { teams, manageableIds } = await getWorkspaceTeams(user);
  if (teams.length === 0) {
    return <EmptyState title={tr("ยังไม่มีพื้นที่ทำงาน")} description={tr("ลองโหลดหน้าใหม่อีกครั้ง")} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const canManage = manageableIds.has(team.id);

  const view: View = params.view === "week" || params.view === "day" ? params.view : "month";
  // วันอ้างอิงของมุมมอง: ?date= · หรือ ?month= (ลิงก์เดิม) · ไม่ระบุ = วันนี้
  const monthParam = typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : null;
  const anchor = isDateKey(params.date) ? params.date : monthParam && monthParam !== today.slice(0, 7) ? `${monthParam}-01` : today;
  const month = anchor.slice(0, 7);

  // ช่วงวันที่แสดง
  const first = `${month}-01`;
  const last = shiftKey(`${shiftMonth(month, 1)}-01`, -1);
  const rangeStart = view === "month" ? weekStart(first) : view === "week" ? weekStart(anchor) : anchor;
  const rangeEnd = view === "month" ? shiftKey(weekStart(last), 6) : view === "week" ? shiftKey(rangeStart, 6) : anchor;
  const days: string[] = [];
  for (let key = rangeStart; key <= rangeEnd; key = shiftKey(key, 1)) days.push(key);
  // มือถือ: มุมมองวันมีแถบสัปดาห์ด้านบนให้กดเลื่อนวัน จึงดึงงานของทั้งสัปดาห์มาแสดงจุด
  const stripDays = view === "day" ? Array.from({ length: 7 }, (_, i) => shiftKey(weekStart(anchor), i)) : days;
  const queryStart = stripDays[0];
  const queryEnd = stripDays[stripDays.length - 1];

  const select = { id: true, number: true, title: true, progress: true, dueDate: true, assigneeId: true, assignee: { select: { name: true } } } as const;
  const [scheduled, unscheduled] = await Promise.all([
    prisma.task.findMany({
      where: { teamId: team.id, deletedAt: null, dueDate: { gte: keyToDate(queryStart), lte: keyToDate(queryEnd) } },
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
  // มุมมองเดือนนับเฉพาะงานของเดือนนั้น (ตารางมีวันของเดือนข้างเคียงติดมาด้วย)
  const inRange = view === "month" ? scheduled.filter((t) => dateToKey(t.dueDate!).startsWith(month)) : view === "day" ? scheduled.filter((t) => dateToKey(t.dueDate!) === anchor) : scheduled;
  const canEdit = (t: Row) => canManage || t.assigneeId === user.id;
  const shared = !team.personalOfId;
  // สีจุดของงานในปฏิทินย่อบนมือถือ
  const dot = (t: Row, key: string) => (t.progress >= 100 ? "bg-success" : key < today ? "bg-danger" : t.assigneeId === user.id ? "bg-primary" : "bg-subtle");
  const tone = (t: Row, key: string) =>
    t.progress >= 100 ? "bg-success-soft text-success line-through" : key < today ? "bg-danger-soft text-danger" : t.assigneeId === user.id ? "bg-primary-soft text-primary" : "bg-surface-sunken text-foreground";
  const href = (v: View, date: string) => `/calendar?team=${team.id}&view=${v}&date=${date}`;
  const taskHref = (t: Row) => `/tasks?team=${team.id}${t.number === null ? "" : `&task=${t.number}`}`;
  // กดวัน = ลงไปชั้นถัดไป
  const deeper = (key: string) => href(view === "month" ? "week" : "day", key);
  const step = (by: number) => (view === "month" ? href("month", `${shiftMonth(month, by)}-01`) : href(view, shiftKey(anchor, by * (view === "week" ? 7 : 1))));
  const rangeLabel =
    view === "month"
      ? monthLabel(month)
      : view === "week"
        ? `${fmt(rangeStart, { day: "numeric", month: "short" })} – ${fmt(rangeEnd, { day: "numeric", month: "short", year: "numeric" })}`
        : formatDateKey(anchor);
  // ใช้กลางประโยค — ภาษาอังกฤษเป็นตัวพิมพ์เล็ก (ภาษาไทยไม่เปลี่ยน)
  const unit = { month: tr("เดือน"), week: tr("สัปดาห์"), day: tr("วัน") }[view].toLowerCase();
  // ตัวเลือกเดือน: ย้อนหลังและล่วงหน้า 12 เดือนจากเดือนที่ดูอยู่
  const monthHref = (m: string) => href(view, m === today.slice(0, 7) ? today : `${m}-01`);
  const monthOptions = Array.from({ length: 25 }, (_, i) => shiftMonth(month, i - 12)).map((m) => ({ value: monthHref(m), label: monthLabel(m) }));

  const TaskLine = ({ t }: { t: Row }) => (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
      <Link href={taskHref(t)} className="min-w-0 flex-1 basis-56 text-sm text-foreground hover:text-primary">
        {t.number !== null && <span className="mr-1.5 tabular-nums text-subtle">#{t.number}</span>}
        <span className={t.progress >= 100 ? "text-subtle line-through" : "font-medium"}>{t.title}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {t.progress}%{shared && ` · ${t.assigneeId === user.id ? tr("ของฉัน") : t.assignee.name}`}
        </span>
      </Link>
      {canEdit(t) && <DueForm id={t.id} title={t.title} dueDate={t.dueDate ? dateToKey(t.dueDate) : null} />}
    </li>
  );
  const Chip = ({ t, day }: { t: Row; day: string }) => (
    <li>
      <Link href={taskHref(t)} title={`${t.title} · ${t.progress}%${shared ? ` · ${t.assignee.name}` : ""}`} className={`block truncate rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:brightness-95 ${tone(t, day)}`}>{t.title}</Link>
    </li>
  );
  const AddLink = ({ day }: { day: string }) =>
    day >= today ? (
      <Link href={`/tasks?team=${team.id}&due=${day}#new`} aria-label={tr("เพิ่มงานกำหนดส่ง {0}", [formatDateKey(day)])} title={tr("เพิ่มงานในวันนี้")} className="rounded px-1 text-sm leading-none text-subtle opacity-0 transition hover:text-primary focus:opacity-100 group-hover/day:opacity-100">+</Link>
    ) : null;
  const arrow = "flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground";
  // รายการเรียงตามวัน: สัปดาห์แสดงครบทุกวัน (กดลงไปดูวันได้) · เดือนแสดงเฉพาะวันที่มีงาน
  const listDays = view === "week" ? days : view === "day" ? [anchor] : [...new Set(inRange.map((t) => dateToKey(t.dueDate!)))];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <p className="eyebrow">{tr("ตารางงาน")}</p>
          <h1 className="page-title">{tr("ปฏิทินงาน")}</h1>
          <p className="page-subtitle">{team.name} · {rangeLabel} · {tr("{0} งานที่มีกำหนดส่งใน{1}นี้", [inRange.length, unit])}</p>
        </div>
        <Link data-tour="cal-add" className="btn" href={`/tasks?team=${team.id}${view === "day" && anchor >= today ? `&due=${anchor}` : ""}#new`}>{tr("+ เพิ่มงาน")}</Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav data-tour="cal-views" aria-label={tr("มุมมอง")} className="flex rounded-full bg-surface-sunken p-1">
          {VIEWS.map(([v, viewLabel]) => (
            <Link key={v} href={href(v, anchor)} aria-current={v === view ? "true" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3.5 text-sm transition ${v === view ? "bg-surface font-semibold text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>{tr(viewLabel)}</Link>
          ))}
        </nav>
        <LinkSelect aria-label={tr("เลือกเดือน")} className="w-44 !min-h-10 !text-sm" value={monthHref(month)} options={monthOptions} />
        <div className="ml-auto flex items-center gap-1">
          {!(anchor === today || (view === "month" && month === today.slice(0, 7)) || (view === "week" && rangeStart === weekStart(today))) && (
            <Link href={href(view, today)} className="rounded-full px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary-soft">{tr("วันนี้")}</Link>
          )}
          <Link href={step(-1)} aria-label={tr("{0}ก่อนหน้า", [unit])} className={arrow}>‹</Link>
          <Link href={step(1)} aria-label={tr("{0}ถัดไป", [unit])} className={arrow}>›</Link>
        </div>
      </div>

      {/* ปฏิทินย่อ (มือถือ): เดือน = ทั้งเดือน · สัปดาห์/วัน = แถบ 7 วัน — จุดสี = งานของวันนั้น กดวันเพื่อลงไปชั้นถัดไป */}
      <section data-tour="cal-grid" className="overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-soft md:hidden" aria-label={tr("ปฏิทิน {0}", [rangeLabel])}>
        <div className="grid grid-cols-7 text-center text-2xs font-semibold text-muted-foreground">
          {WEEKDAYS.map((d, i) => <div key={d} className={`pb-1 ${i === 0 || i === 6 ? "text-danger" : ""}`}>{tr(d)}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {stripDays.map((key) => {
            const tasks = byDay.get(key) ?? [];
            const outside = view === "month" && !key.startsWith(month);
            const selected = view === "day" && key === anchor;
            return (
              <Link key={key} href={view === "day" ? href("day", key) : deeper(key)} scroll={false} aria-current={selected ? "date" : undefined} aria-label={`${formatDateKey(key)}${holidayName(key) ? ` ${holidayName(key)}` : ""} · ${tasks.length} ${tr("งาน")}`} className={`flex min-h-12 flex-col items-center gap-1 rounded-xl py-1 transition active:bg-surface-sunken ${selected ? "bg-primary-soft" : ""} ${outside ? "opacity-40" : ""}`}>
                <span className={`flex size-7 items-center justify-center rounded-full text-sm tabular-nums ${key === today ? "bg-primary font-semibold text-primary-foreground" : dayTone(key)} ${selected && key !== today ? "font-semibold ring-2 ring-primary" : ""}`}>{Number(key.slice(8))}</span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {tasks.slice(0, 3).map((t) => <span key={t.id} className={`size-1.5 rounded-full ${dot(t, key)}`} />)}
                  {tasks.length > 3 && <span className="text-[0.6rem] leading-none text-muted-foreground">+</span>}
                </span>
              </Link>
            );
          })}
        </div>
        <p className="mt-1.5 flex flex-wrap justify-center gap-x-3 gap-y-0.5 border-t border-border pt-1.5 text-2xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" />{tr("งานของฉัน")}</span>
          {shared && <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-subtle" />{tr("งานของคนอื่น")}</span>}
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />{tr("เลยกำหนด")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-success" />{tr("เสร็จแล้ว")}</span>
        </p>
      </section>

      {/* ตาราง (จอใหญ่): เดือน = ช่องเตี้ย เห็นได้ 3 งานต่อวัน · สัปดาห์ = ช่องสูง เห็นทุกงาน */}
      {view !== "day" && (
        <section data-tour="cal-grid" className="hidden overflow-hidden rounded-2xl border border-border bg-surface shadow-soft md:block" aria-label={tr("ปฏิทิน {0}", [rangeLabel])}>
          <div className="grid grid-cols-7 border-b border-border bg-surface-sunken text-center text-xs font-semibold text-muted-foreground">
            {WEEKDAYS.map((d, i) => <div key={d} className={`py-2 ${i === 0 || i === 6 ? "text-danger" : ""}`}>{tr(d)}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((key) => {
              const tasks = byDay.get(key) ?? [];
              const outside = view === "month" && !key.startsWith(month);
              const limit = view === "month" ? 3 : tasks.length;
              return (
                <div key={key} className={`group/day border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0 ${view === "month" ? "min-h-28" : "min-h-72"} ${outside ? "bg-surface-sunken/60" : ""}`}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link
                      href={deeper(key)}
                      title={view === "month" ? tr("ดูสัปดาห์นี้") : tr("ดูวันนี้")}
                      aria-label={`${formatDateKey(key)} — ${view === "month" ? tr("ดูสัปดาห์นี้") : tr("ดูวันนี้")}`}
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs tabular-nums transition hover:ring-2 hover:ring-primary/40 ${key === today ? "bg-primary font-semibold text-primary-foreground" : outside ? `${dayTone(key)} opacity-40` : dayTone(key)}`}
                    >
                      {Number(key.slice(8))}
                    </Link>
                    {holidayName(key) && <span title={holidayName(key)} className={`mx-1 min-w-0 flex-1 truncate text-2xs font-medium text-sky-600 ${outside ? "opacity-40" : ""}`}>{holidayName(key)}</span>}
                    <AddLink day={key} />
                  </div>
                  <ul className="space-y-1">
                    {tasks.slice(0, limit).map((t) => <Chip key={t.id} t={t} day={key} />)}
                    {tasks.length > limit && <li><Link href={deeper(key)} className="px-1.5 text-xs text-muted-foreground hover:text-primary">{tr("+ อีก {0} งาน", [tasks.length - limit])}</Link></li>}
                  </ul>
                </div>
              );
            })}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-primary-soft ring-1 ring-primary/30" />{tr("งานของฉัน")}</span>
            {shared && <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-surface-sunken ring-1 ring-border-strong" />{tr("งานของคนอื่น")}</span>}
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-danger-soft ring-1 ring-danger/30" />{tr("เลยกำหนด")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded bg-success-soft ring-1 ring-success/30" />{tr("เสร็จแล้ว")}</span>
            <span className="font-medium text-danger">{tr("เสาร์–อาทิตย์")}</span>
            <span className="font-medium text-sky-600">{tr("วันหยุดนักขัตฤกษ์")}</span>
            <span>{tr("กดตัวเลขวันเพื่อดู")}{view === "month" ? tr("สัปดาห์นั้น") : tr("วันนั้น")}</span>
          </p>
        </section>
      )}

      <section className="card">
        <h2 className="mb-1 font-semibold text-foreground">{view === "day" ? tr("งานของ {0}", [formatDateKey(anchor)]) : tr("งาน{0}นี้ เรียงตามวัน", [unit])}</h2>
        {view === "day" && holidayName(anchor) && <p className="text-sm font-medium text-sky-600">{holidayName(anchor)}</p>}
        {listDays.length === 0 || (view === "day" && inRange.length === 0) ? (
          <p className="text-sm text-muted-foreground">{view === "day" ? tr("ไม่มีงานที่กำหนดส่งวันนี้") : tr("ยังไม่มีงานที่กำหนดส่งในเดือนนี้ — เพิ่มงานแล้วใส่กำหนดส่ง หรือกำหนดวันให้งานด้านล่าง")}</p>
        ) : view === "day" ? (
          <ul className="divide-y divide-border">{inRange.map((t) => <TaskLine key={t.id} t={t} />)}</ul>
        ) : (
          listDays.map((key) => (
            <div key={key} className="border-t border-border py-2 first:border-t-0">
              <h3 className="text-xs font-semibold">
                <Link href={deeper(key)} className={`hover:underline ${key === today ? "text-primary" : dayTone(key) === "text-foreground" ? (key < today ? "text-subtle" : "text-muted-foreground") : dayTone(key)}`}>
                  {formatDateKey(key)}{key === today && tr(" · วันนี้")}
                </Link>
                {holidayName(key) && <span className="ml-1.5 font-medium text-sky-600">{holidayName(key)}</span>}
              </h3>
              {(byDay.get(key) ?? []).length === 0 ? <p className="py-1 text-xs text-subtle">{tr("ไม่มีงาน")}</p> : <ul className="divide-y divide-border/60">{byDay.get(key)!.map((t) => <TaskLine key={t.id} t={t} />)}</ul>}
            </div>
          ))
        )}
      </section>

      {unscheduled.length > 0 && (
        <section className="card">
          <h2 className="font-semibold text-foreground">{tr("งานที่ยังไม่มีกำหนดส่ง (")}{unscheduled.length})</h2>
          <p className="mb-1 text-sm text-muted-foreground">{tr("เลือกวันแล้วกดบันทึก งานจะขึ้นในปฏิทิน")}</p>
          <ul className="divide-y divide-border">{unscheduled.map((t) => <TaskLine key={t.id} t={t} />)}</ul>
        </section>
      )}
    </div>
  );
}
