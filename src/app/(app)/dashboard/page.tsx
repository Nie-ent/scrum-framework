import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { getMeetingUrl, getVisibleTeams } from "@/lib/teams";
import { currentSpaceId, pickSpace } from "@/lib/space";
import { toTasks } from "@/lib/tasks";
import { dateToKey, isDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { formatDateKey } from "@/lib/format-dates";
import { dayTone } from "@/lib/holidays";
import { DashboardCalendar } from "@/components/dashboard-calendar";
import { EmptyState } from "@/components/ui-state";
import { ProgressSummary, StandupSections } from "@/components/standup-card";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { CommentThread } from "@/components/comments";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("ภาพรวมทีม") };
}

const TREND_DAYS = 7;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireOverviewAccess();
  const params = await searchParams;
  const today = todayKey();
  const canAttach = isFileStorageConfigured();
  const dateKey = isDateKey(params.date) ? params.date : today;
  const teams = await getVisibleTeams(viewer);
  if (teams.length === 0) redirect("/standup");

  // ดูได้ทีละทีมเสมอ — ไม่ได้เลือก (หรือเลือกทีมที่ไม่มีสิทธิ์) = ทีมแรกที่ดูได้
  const requested = typeof params.team === "string" ? params.team : undefined;
  // พื้นที่ที่เลือกอยู่ไม่มีภาพรวมทีม (เช่นพื้นที่ส่วนตัว): ไม่เดาทีมให้เอง — มีทีมเดียวก็ไปทีมนั้น มีหลายทีมให้เลือกก่อน
  const saved = await currentSpaceId();
  if (!teams.some((t) => t.id === requested) && !teams.some((t) => t.id === saved)) {
    if (teams.length === 1) redirect(`/dashboard?team=${teams[0].id}`);
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <div>
          <p className="eyebrow">{tr("สุขภาพทีม")}</p>
          <h1 className="page-title">{tr("ภาพรวมทีม")}</h1>
          <p className="page-subtitle">{tr("พื้นที่ที่เลือกอยู่ไม่มีภาพรวมทีม — เลือกทีมที่จะดู")}</p>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-soft">
          {teams.map((t) => (
            <li key={t.id}>
              <Link href={`/dashboard?team=${t.id}`} className={`flex min-h-12 items-center gap-3 pr-4 transition hover:bg-surface-sunken ${t.parentId && teams.some((p) => p.id === t.parentId) ? "pl-10" : "pl-4"}`}>
                <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-bold text-primary">{t.name.trim().charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium text-foreground">{t.name}</span>
                <span className="text-subtle" aria-hidden="true">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const team = (await pickSpace(teams, requested))!;
  const teamId = team.id;
  // กระดานแยกตามทีม: เห็นเฉพาะ scrum ที่เขียนให้ทีมที่เลือก (ไม่รวมทีมแม่/ทีมย่อย)
  const scopeIds = [teamId];

  const trendStart = shiftKey(dateKey, -(TREND_DAYS - 1));
  // ทั้งเดือนที่กำลังดู: จำนวนคนที่เช็กอินในแต่ละวัน (จุดสีในปฏิทิน)
  // เดือนที่ปฏิทินแสดง: เลื่อนดูเดือนอื่นได้โดยไม่เปลี่ยนวันที่กำลังดู (?month=YYYY-MM)
  const monthKey = typeof params.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) && params.month <= today.slice(0, 7) ? params.month : dateKey.slice(0, 7);
  const monthStart = `${monthKey}-01`;
  const monthEnd = dateToKey(new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0)));
  const [memberships, standups, meetingUrl, monthly] = await Promise.all([
    prisma.teamMember.findMany({
      // เฉพาะคนที่ต้องเช็กอิน — ไม่นับคนที่อยู่ในทีมในฐานะผู้ดูแลอย่างเดียว
      where: { teamId: { in: scopeIds }, participates: true, user: { active: true } },
      include: { team: true, user: { include: { role: true } } },
      orderBy: [{ team: { name: "asc" } }, { user: { name: "asc" } }],
    }),
    prisma.standup.findMany({
      where: { teamId: { in: scopeIds }, date: { gte: keyToDate(trendStart), lte: keyToDate(dateKey) } },
      include: { comments: withComments },
    }),
    getMeetingUrl(teamId),
    prisma.standup.findMany({
      where: { teamId: { in: scopeIds }, date: { gte: keyToDate(monthStart), lte: keyToDate(monthEnd) } },
      select: { date: true, userId: true },
    }),
  ]);
  const memberIds = new Set(memberships.map((m) => m.userId));
  const submittedByDay: Record<string, number> = {};
  for (const s of monthly) if (memberIds.has(s.userId)) submittedByDay[dateToKey(s.date)] = (submittedByDay[dateToKey(s.date)] ?? 0) + 1;

  // 1 แถว = 1 คนในทีมนั้น (คนที่อยู่หลายทีมจะมีแถวแยกต่อทีมเมื่อดู "ทุกทีม")
  const rows = memberships.map(({ user, team, title }) => {
    const own = standups.filter((s) => s.userId === user.id && s.teamId === team.id);
    return {
      key: `${user.id}:${team.id}`,
      member: user,
      title: title ?? user.role.name,
      team,
      entry: own.find((s) => dateToKey(s.date) === dateKey),
      days: new Set(own.map((s) => dateToKey(s.date))),
    };
  });
  const submitted = rows.filter((r) => r.entry);
  const missing = rows.filter((r) => !r.entry);
  const withField = (key: "blockers" | "notWorking" | "workingWell") => submitted.filter((r) => r.entry![key]);
  const blockers = withField("blockers");
  const notWorking = withField("notWorking");
  const workingWell = withField("workingWell");
  const trendKeys = Array.from({ length: TREND_DAYS }, (_, i) => shiftKey(trendStart, i));

  // มุมมองรายคน: ตาราง (ค่าเริ่มต้น) หรือการ์ดแบบ grid — เก็บใน URL เพื่อให้คงอยู่เมื่อเปลี่ยนวัน/ทีม
  const view = params.view === "grid" ? "grid" : "table";
  const viewParam = view === "grid" ? "&view=grid" : "";
  const href = (date: string, nextView = viewParam) => `/dashboard?date=${date}&team=${teamId}${nextView}`;
  const scopeLabel = team.name;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">{tr("สุขภาพทีม")}</p>
          <h1 className="page-title">{tr("ภาพรวมทีม")}</h1>
          <p className="page-subtitle">{scopeLabel} · {formatDateKey(dateKey)}{dateKey === today && tr(" (วันนี้)")}</p>
          {meetingUrl && (
            <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className="btn mt-3 gap-1.5"><Icon name="video" />{tr("เข้าห้องประชุม")}</a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label={dateKey === today ? tr("เช็กอินวันนี้") : tr("เช็กอินของวันที่ดู")}
          value={<>{submitted.length}/{rows.length}<span className="ml-2 text-base font-medium text-muted-foreground">{rows.length === 0 ? 0 : Math.round((submitted.length / rows.length) * 100)}%</span></>}
          tone="indigo"
          percent={rows.length === 0 ? 0 : (submitted.length / rows.length) * 100}
        />
        <Stat label={tr("ติดปัญหา")} value={blockers.length} tone="red" />
        <Stat label={tr("ควรปรับปรุง")} value={notWorking.length} tone="amber" />
        <Stat label={tr("ไปได้ดี")} value={workingWell.length} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        {/* การส่ง 7 วันล่าสุด — สัดส่วนเช็กอินของวันที่ดูอยู่ในการ์ด "ส่งแล้ว" ด้านบน */}
        <section className="card p-4">
          <div className="min-w-0 overflow-x-auto">
            <h2 className="mb-2 text-sm font-semibold text-foreground">{tr("การส่ง")}{" "}{TREND_DAYS} {tr("วันล่าสุด")}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-4 font-medium">{tr("สมาชิก")}</th>
                  {trendKeys.map((k) => (
                    <th key={k} className="px-1 text-center font-medium">
                      <Link href={href(k)} scroll={false} title={formatDateKey(k)} className={`tabular-nums hover:text-primary ${k === dateKey ? "font-semibold text-primary" : dayTone(k) === "text-foreground" ? "" : dayTone(k)}`}>{Number(k.slice(8))}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, member, days }) => (
                  <tr key={key} className="border-t border-border">
                    <td className="max-w-40 truncate py-1.5 pr-4">
                      <Link href={`/dashboard/member/${member.id}`} className="text-foreground hover:text-primary">{member.name}</Link>
                    </td>
                    {trendKeys.map((k) => (
                      <td key={k} className="text-center">
                        <span aria-label={days.has(k) ? tr("ส่งแล้ว") : tr("ไม่ได้ส่ง")} className={`inline-block size-2.5 rounded-full ${days.has(k) ? "bg-success" : "bg-border-strong"}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">{tr("ยังไม่มีสมาชิกที่ต้องเช็กอิน")}</p>}
          </div>
        </section>
        <DashboardCalendar dateKey={dateKey} monthKey={monthKey} teamId={teamId} view={view === "grid" ? "grid" : undefined} submitted={submittedByDay} expected={rows.length} />
      </div>

      {(blockers.length > 0 || missing.length > 0) && (
        <section className="card border-rose-200 bg-rose-50/30">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow text-rose-600">{tr("ต้องดูแล")}</p><h2 className="font-semibold text-rose-950">{tr("รายการที่ต้องดูแล")}</h2></div><span className="badge badge-danger">{blockers.length + missing.length} {tr("รายการ")}</span></div>
          {blockers.length > 0 && <>
          <h3 className="mb-2 text-sm font-semibold text-rose-700">{tr("เรื่องที่ติดขัดและต้องการความช่วยเหลือ")}</h3>
          <ul className="space-y-2">
            {blockers.map(({ key, member, entry }) => (
              <li key={key} className="text-sm">
                <span className="font-medium">{member.name}</span>:{" "}
                <span className="whitespace-pre-wrap">{entry!.blockers}</span>
              </li>
            ))}
          </ul>
          </>}
          {missing.length > 0 && <div className={blockers.length > 0 ? "mt-4 border-t border-rose-100 pt-4" : ""}><h3 className="mb-2 text-sm font-semibold text-slate-700">{tr("ยังไม่ส่ง (")}{missing.length})</h3><div className="flex flex-wrap gap-2">{missing.map(({ key, member }) => <Link key={key} href={`/dashboard/member/${member.id}`} className="badge badge-neutral hover:bg-slate-200">{member.name}</Link>)}</div></div>}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FeedbackList title={tr("สิ่งที่ควรปรับปรุง")} tone="text-amber-700" items={notWorking.map((r) => [r.member.name, r.entry!.notWorking!])} />
        <FeedbackList title={tr("สิ่งที่ไปได้ดี")} tone="text-emerald-700" items={workingWell.map((r) => [r.member.name, r.entry!.workingWell!])} />
      </div>

      {rows.length === 0 ? <EmptyState title={tr("ยังไม่มีสมาชิกในขอบเขตนี้")} description={tr("เลือกทีมอื่น หรือตรวจสอบการกำหนดสมาชิกในหน้าจัดการระบบ")} /> : <section className="space-y-4">
        <div className="flex items-end justify-between gap-3"><div><p className="eyebrow">{tr("ความเคลื่อนไหว")}</p><h2 className="section-heading">{tr("ความคืบหน้ารายคน")}</h2><p className="section-description">{tr("ติดตามสิ่งที่ทำเมื่อวาน แผนวันนี้ และงานที่ต้องการความช่วยเหลือ")}</p></div><div className="hidden rounded-2xl bg-slate-100 p-1 md:flex" role="group" aria-label={tr("มุมมอง")}>
            {([["table", tr("☰ ตาราง"), ""], ["grid", tr("▦ การ์ด"), "&view=grid"]] as const).map(([key, label, param]) => (
              <Link key={key} href={href(dateKey, param)} aria-current={view === key ? "true" : undefined} className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm transition ${view === key ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}>
                {label}
              </Link>
            ))}
          </div></div>
        {/* มือถือแสดงการ์ดเสมอ (ตารางกว้างเกินจอ) — จอใหญ่เลือกได้ระหว่างตาราง/การ์ด */}
        <div className={`grid gap-4 md:grid-cols-2 2xl:grid-cols-3 ${view === "grid" ? "" : "md:hidden"}`}>
            {rows.map(({ key, member, title, team, entry }) => (
              <article key={key} className={`card flex flex-col gap-3 ${entry ? "transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md" : "border-dashed bg-slate-50/60"}`}>
                <header className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={member} size={36} />
                    <div className="min-w-0">
                      <Link href={`/dashboard/member/${member.id}`} className="block truncate font-semibold text-slate-800 hover:text-indigo-700">{member.name}</Link>
                      <p className="truncate text-xs text-slate-500">{title} · {team.name}</p>
                    </div>
                  </div>
                  {entry ? <span className={`shrink-0 ${entry.blockers ? "badge badge-danger" : "badge badge-success"}`}>{entry.blockers ? tr("ต้องการความช่วยเหลือ") : tr("ส่งแล้ว")}</span> : <span className="badge badge-warning shrink-0">{tr("ยังไม่ส่ง")}</span>}
                </header>
                {entry ? (
                  <>
                    <StandupSections teamId={team.id} standup={entry} only={["yesterdayTasks", "todayTasks", "blockers"]} />
                    <CommentThread teamId={team.id} canAttach={canAttach} target={{ standupId: entry.id }} comments={entry.comments} viewerId={viewer.id} canModerate subject={tr("เช็กอินของ {0}", [member.name])} />
                  </>
                ) : (
                  <p className="text-sm text-slate-400">{tr("ยังไม่ได้เช็กอินของวันนี้")}</p>
                )}
              </article>
            ))}
        </div>
        {view === "table" && (
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:block">
          <table className="w-full min-w-[940px] text-sm"><caption className="sr-only">{tr("รายชื่อสมาชิกและสถานะเช็กอินของทีม")}{" "}{scopeLabel}</caption><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">{tr("สมาชิก")}</th><th className="px-4 py-3">{tr("สถานะ")}</th><th className="px-4 py-3">{tr("เมื่อวานทำอะไร")}</th><th className="px-4 py-3">{tr("ความคืบหน้า")}</th><th className="px-4 py-3">{tr("แผนวันนี้")}</th><th className="px-5 py-3 text-right">{tr("ดูข้อมูล")}</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(({ key, member, title, entry }) => <tr key={key} className="align-top transition hover:bg-indigo-50/40"><td className="px-5 py-3"><div className="flex items-center gap-3"><Avatar user={member} size={36} /><div><Link href={`/dashboard/member/${member.id}`} className="font-semibold text-slate-800 hover:text-indigo-700">{member.name}</Link><p className="text-xs text-slate-500">{title}</p></div></div></td><td className="px-4 py-3">{entry ? <span className={entry.blockers ? "badge badge-danger" : "badge badge-success"}>{entry.blockers ? tr("ต้องการความช่วยเหลือ") : tr("ส่งแล้ว")}</span> : <span className="badge badge-warning">{tr("ยังไม่ส่ง")}</span>}</td><td className="max-w-xs px-4 py-3 text-slate-600">{entry ? <YesterdayTasks value={entry.yesterdayTasks} /> : "—"}</td><td className="px-4 py-3"><div className="pt-0.5">{entry ? <ProgressSummary value={entry.yesterdayTasks} /> : <span className="text-slate-400">—</span>}</div></td><td className="max-w-xs px-4 py-3 text-slate-600">{entry ? <TodayTasks value={entry.todayTasks} /> : "—"}</td><td className="px-5 py-3 text-right"><Link href={`/dashboard/member/${member.id}`} className="whitespace-nowrap text-sm font-semibold text-indigo-600 hover:text-indigo-800">{entry && entry.comments.length > 0 && <span className="mr-2 inline-flex items-center gap-1 align-middle font-medium text-slate-500"><Icon name="comment" className="h-3.5 w-3.5" />{entry.comments.length}</span>}{tr("รายละเอียด →")}</Link></td></tr>)}</tbody>
          </table>
        </div>
        )}
      </section>}

    </div>
  );
}

function Stat({ label, value, tone, percent }: { label: string; value: React.ReactNode; tone: "indigo" | "red" | "amber" | "emerald"; /** แถบสัดส่วนใต้ตัวเลข (0–100) */ percent?: number }) {
  const color = { indigo: "text-indigo-600", red: "text-rose-600", amber: "text-amber-600", emerald: "text-emerald-600" }[tone];
  return (
    <div className="card py-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tracking-tight ${color}`}>{value}</div>
      {percent !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
          <div className={`h-full rounded-full ${percent >= 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      )}
    </div>
  );
}

function FeedbackList({ title, tone, items }: { title: string; tone: string; items: [string, string][] }) {
  return (
    <section className="card">
      <h2 className={`mb-3 font-semibold ${tone}`}>{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">{tr("ไม่มี")}</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {items.map(([name, text], i) => (
            <li key={i}>
              <span className="font-medium">{name}:</span> <span className="whitespace-pre-wrap">{text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** แผนวันนี้แบบย่อในตาราง: แสดง 3 task แรก */
function TodayTasks({ value }: { value: unknown }) {
  const tasks = toTasks(value);
  if (tasks.length === 0) return <>—</>;
  return (
    <ul className="space-y-0.5">
      {tasks.slice(0, 3).map((t, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="text-indigo-400" aria-hidden="true">•</span>
          <span className="line-clamp-1">{t.text}</span>
        </li>
      ))}
      {tasks.length > 3 && <li className="pl-3 text-xs text-slate-400">{tr("+ อีก {0} งาน", [tasks.length - 3])}</li>}
    </ul>
  );
}

/** สรุปงานเมื่อวานในตาราง พร้อมสถานะล่าสุดของแต่ละงาน */
function YesterdayTasks({ value }: { value: unknown }) {
  const tasks = toTasks(value);
  if (tasks.length === 0) return <>—</>;
  return (
    <ul className="space-y-0.5">
      {tasks.slice(0, 2).map((task, index) => (
        <li key={index} className="flex gap-1.5">
          <span className={task.progress === 100 ? "text-emerald-600" : "text-slate-400"} aria-hidden="true">{task.progress === 100 ? "✓" : "○"}</span>
          <span className="line-clamp-1">{task.text}</span>
        </li>
      ))}
      {tasks.length > 2 && <li className="pl-3 text-xs text-slate-400">{tr("+ อีก {0} งาน", [tasks.length - 2])}</li>}
    </ul>
  );
}
