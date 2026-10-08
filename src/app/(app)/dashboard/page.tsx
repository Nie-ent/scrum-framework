import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { canViewAllTeams } from "@/lib/permissions";
import { getVisibleTeams } from "@/lib/teams";
import { toTasks } from "@/lib/tasks";
import { dateToKey, formatDateKey, isDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { DashboardCalendar } from "@/components/dashboard-calendar";
import { TeamHealthChart } from "@/components/team-health-chart";
import { EmptyState } from "@/components/ui-state";
import { ProgressSummary, StandupSections } from "@/components/standup-card";
import { Avatar } from "@/components/avatar";
import { CommentThread } from "@/components/comments";
import { withComments } from "@/lib/comments";
import { isFileStorageConfigured } from "@/lib/file-store";

const TREND_DAYS = 7;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireOverviewAccess();
  const params = await searchParams;
  const today = todayKey();
  const canAttach = isFileStorageConfigured();
  const dateKey = isDateKey(params.date) ? params.date : today;
  const allTeams = canViewAllTeams(viewer.role.level);
  const teams = await getVisibleTeams(viewer);

  // Manager เลือก "ทุกทีม" ได้ (teamId = ""), หัวหน้าทีมเริ่มที่ทีมแรกที่ตัวเองดูได้
  const requested = typeof params.team === "string" ? params.team : undefined;
  const teamId = teams.some((t) => t.id === requested) ? requested! : allTeams ? "" : teams[0]?.id ?? "";
  // กระดานแยกตามทีม: เห็นเฉพาะ scrum ที่เขียนให้ทีมที่เลือก (ไม่รวมทีมแม่/ทีมย่อย)
  const scopeIds = (teamId ? teams.filter((t) => t.id === teamId) : teams).map((t) => t.id);

  const trendStart = shiftKey(dateKey, -(TREND_DAYS - 1));
  const [memberships, standups] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: { in: scopeIds }, user: { active: true } },
      include: { team: true, user: { include: { role: true } } },
      orderBy: [{ team: { name: "asc" } }, { user: { name: "asc" } }],
    }),
    prisma.standup.findMany({
      where: { teamId: { in: scopeIds }, date: { gte: keyToDate(trendStart), lte: keyToDate(dateKey) } },
      include: { comments: withComments },
    }),
  ]);

  // 1 แถว = 1 คนในทีมนั้น (คนที่อยู่หลายทีมจะมีแถวแยกต่อทีมเมื่อดู "ทุกทีม")
  const rows = memberships.map(({ user, team }) => {
    const own = standups.filter((s) => s.userId === user.id && s.teamId === team.id);
    return {
      key: `${user.id}:${team.id}`,
      member: user,
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
  const href = (date: string, nextView = viewParam) => `/dashboard?date=${date}${teamId ? `&team=${teamId}` : ""}${nextView}`;
  const scopeLabel = teams.find((t) => t.id === teamId)?.name ?? "ทุกทีม";

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">Team health</p>
          <h1 className="page-title">ภาพรวม Scrum</h1>
          <p className="page-subtitle">
            {scopeLabel} · {formatDateKey(dateKey)}
            {dateKey === today && " (วันนี้)"}
          </p>
        </div>
        <div className="card flex w-full flex-wrap items-center gap-2 p-2 sm:w-auto">
          <Link className="btn-ghost" href={href(shiftKey(dateKey, -1))}>← ก่อนหน้า</Link>
          <form className="order-last flex min-w-0 basis-full gap-2 sm:order-none sm:basis-auto" action="/dashboard">
            {view === "grid" && <input type="hidden" name="view" value="grid" />}
            <input aria-label="วันที่" type="date" name="date" defaultValue={dateKey} max={today} className="input min-h-10 min-w-0 flex-1 py-1.5 sm:w-auto sm:flex-none" />
            <select aria-label="ทีม" name="team" defaultValue={teamId} className="input min-h-10 min-w-0 flex-1 py-1.5 sm:w-auto sm:flex-none">
              {allTeams && <option value="">ทุกทีม</option>}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.parentId && teams.some((p) => p.id === t.parentId) ? "\u00a0\u00a0└ " : ""}
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn-ghost">ดู</button>
          </form>
          {dateKey < today && <Link className="btn-ghost" href={href(shiftKey(dateKey, 1))}>ถัดไป →</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="ส่งแล้ว" value={`${submitted.length}/${rows.length}`} tone="indigo" />
        <Stat label="Blockers" value={blockers.length} tone="red" />
        <Stat label="ควรปรับปรุง" value={notWorking.length} tone="amber" />
        <Stat label="ไปได้ดี" value={workingWell.length} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <TeamHealthChart submitted={submitted.length} total={rows.length} />
        <DashboardCalendar dateKey={dateKey} teamId={teamId} view={view === "grid" ? "grid" : undefined} />
      </div>

      {(blockers.length > 0 || missing.length > 0) && (
        <section className="card border-rose-200 bg-rose-50/30">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow text-rose-600">Needs attention</p><h2 className="font-semibold text-rose-950">รายการที่ต้องดูแล</h2></div><span className="badge badge-danger">{blockers.length + missing.length} รายการ</span></div>
          {blockers.length > 0 && <>
          <h3 className="mb-2 text-sm font-semibold text-rose-700">Blockers ที่ต้องช่วยปลดล็อก</h3>
          <ul className="space-y-2">
            {blockers.map(({ key, member, team, entry }) => (
              <li key={key} className="text-sm">
                <span className="font-medium">{member.name}</span>
                {!teamId && <span className="text-slate-400"> · {team.name}</span>}:{" "}
                <span className="whitespace-pre-wrap">{entry!.blockers}</span>
              </li>
            ))}
          </ul>
          </>}
          {missing.length > 0 && <div className={blockers.length > 0 ? "mt-4 border-t border-rose-100 pt-4" : ""}><h3 className="mb-2 text-sm font-semibold text-slate-700">ยังไม่ส่ง ({missing.length})</h3><div className="flex flex-wrap gap-2">{missing.map(({ key, member, team }) => <Link key={key} href={`/dashboard/member/${member.id}`} className="badge badge-neutral hover:bg-slate-200">{member.name}{!teamId && ` · ${team.name}`}</Link>)}</div></div>}
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FeedbackList title="สิ่งที่ควรปรับปรุง" tone="text-amber-700" items={notWorking.map((r) => [r.member.name, r.entry!.notWorking!])} />
        <FeedbackList title="สิ่งที่ไปได้ดี" tone="text-emerald-700" items={workingWell.map((r) => [r.member.name, r.entry!.workingWell!])} />
      </div>

      {rows.length === 0 ? <EmptyState title="ยังไม่มีสมาชิกในขอบเขตนี้" description="เลือกทีมอื่น หรือตรวจสอบการกำหนดสมาชิกในหน้าจัดการระบบ" /> : <section className="space-y-4">
        <div className="flex items-end justify-between gap-3"><div><p className="eyebrow">Team updates</p><h2 className="text-lg font-semibold text-slate-950">ความคืบหน้ารายคน</h2></div><div className="hidden rounded-2xl bg-slate-100 p-1 md:flex" role="group" aria-label="มุมมอง">
            {([["table", "☰ ตาราง", ""], ["grid", "▦ การ์ด", "&view=grid"]] as const).map(([key, label, param]) => (
              <Link key={key} href={href(dateKey, param)} aria-current={view === key ? "true" : undefined} className={`inline-flex min-h-9 items-center rounded-xl px-3 text-sm transition ${view === key ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"}`}>
                {label}
              </Link>
            ))}
          </div></div>
        {/* มือถือแสดงการ์ดเสมอ (ตารางกว้างเกินจอ) — จอใหญ่เลือกได้ระหว่างตาราง/การ์ด */}
        <div className={`grid gap-4 md:grid-cols-2 2xl:grid-cols-3 ${view === "grid" ? "" : "md:hidden"}`}>
            {rows.map(({ key, member, team, entry }) => (
              <article key={key} className={`card flex flex-col gap-3 ${entry ? "transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md" : "border-dashed bg-slate-50/60"}`}>
                <header className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={member} size={36} />
                    <div className="min-w-0">
                      <Link href={`/dashboard/member/${member.id}`} className="block truncate font-semibold text-slate-800 hover:text-indigo-700">{member.name}</Link>
                      <p className="truncate text-xs text-slate-500">{member.role.name} · {team.name}</p>
                    </div>
                  </div>
                  {entry ? <span className={`shrink-0 ${entry.blockers ? "badge badge-danger" : "badge badge-success"}`}>{entry.blockers ? "ต้องการความช่วยเหลือ" : "ส่งแล้ว"}</span> : <span className="badge badge-warning shrink-0">ยังไม่ส่ง</span>}
                </header>
                {entry ? (
                  <>
                    <StandupSections standup={entry} only={["yesterdayTasks", "todayTasks", "blockers"]} />
                    <CommentThread canAttach={canAttach} target={{ standupId: entry.id }} comments={entry.comments} viewerId={viewer.id} canModerate subject={`เช็กอินของ ${member.name}`} />
                  </>
                ) : (
                  <p className="text-sm text-slate-400">ยังไม่ได้เช็กอินของวันนี้</p>
                )}
              </article>
            ))}
        </div>
        {view === "table" && (
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:block">
          <table className="w-full min-w-[1080px] text-sm"><caption className="sr-only">รายชื่อสมาชิกและสถานะ Daily Scrum</caption><thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">สมาชิก</th><th className="px-4 py-3">ทีม</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">เมื่อวานทำอะไร</th><th className="px-4 py-3">ความคืบหน้า</th><th className="px-4 py-3">แผนวันนี้</th><th className="px-5 py-3 text-right">ดูข้อมูล</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map(({ key, member, team, entry }) => <tr key={key} className="transition hover:bg-indigo-50/40"><td className="px-5 py-3"><div className="flex items-center gap-3"><Avatar user={member} size={36} /><div><Link href={`/dashboard/member/${member.id}`} className="font-semibold text-slate-800 hover:text-indigo-700">{member.name}</Link><p className="text-xs text-slate-500">{member.role.name}</p></div></div></td><td className="px-4 py-3 text-slate-500">{team.name}</td><td className="px-4 py-3">{entry ? <span className={entry.blockers ? "badge badge-danger" : "badge badge-success"}>{entry.blockers ? "ต้องการความช่วยเหลือ" : "ส่งแล้ว"}</span> : <span className="badge badge-warning">ยังไม่ส่ง</span>}</td><td className="max-w-xs px-4 py-3 text-slate-600">{entry ? <YesterdayTasks value={entry.yesterdayTasks} /> : "—"}</td><td className="px-4 py-3">{entry ? <ProgressSummary value={entry.yesterdayTasks} /> : <span className="text-slate-400">—</span>}</td><td className="max-w-xs px-4 py-3 text-slate-600">{entry ? <TodayTasks value={entry.todayTasks} /> : "—"}</td><td className="px-5 py-3 text-right"><Link href={`/dashboard/member/${member.id}`} className="whitespace-nowrap text-sm font-semibold text-indigo-600 hover:text-indigo-800">{entry && entry.comments.length > 0 && <span className="mr-2 font-medium text-slate-500">💬 {entry.comments.length}</span>}รายละเอียด →</Link></td></tr>)}</tbody>
          </table>
        </div>
        )}
      </section>}

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">การส่ง {TREND_DAYS} วันล่าสุด</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-4 font-medium">สมาชิก</th>
              {trendKeys.map((k) => (
                <th key={k} className="px-1 text-center font-medium">
                  <Link href={href(k)} className="hover:text-indigo-600">{k.slice(8)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ key, member, team, days }) => (
              <tr key={key} className="border-t border-slate-100">
                <td className="py-1.5 pr-4">
                  <Link href={`/dashboard/member/${member.id}`} className="hover:text-indigo-600">{member.name}</Link>
                  {!teamId && <span className="text-xs text-slate-400"> · {team.name}</span>}
                </td>
                {trendKeys.map((k) => (
                  <td key={k} className="text-center">
                    <span className={`inline-block h-3 w-3 rounded-full ${days.has(k) ? "bg-emerald-500" : "bg-slate-200"}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone: "indigo" | "red" | "amber" | "emerald" }) {
  const color = { indigo: "text-indigo-600", red: "text-rose-600", amber: "text-amber-600", emerald: "text-emerald-600" }[tone];
  return (
    <div className="card py-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tracking-tight ${color}`}>{value}</div>
    </div>
  );
}

function FeedbackList({ title, tone, items }: { title: string; tone: string; items: [string, string][] }) {
  return (
    <section className="card">
      <h2 className={`mb-3 font-semibold ${tone}`}>{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">ไม่มี</p>
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
      {tasks.length > 3 && <li className="pl-3 text-xs text-slate-400">+ อีก {tasks.length - 3} task</li>}
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
      {tasks.length > 2 && <li className="pl-3 text-xs text-slate-400">+ อีก {tasks.length - 2} งาน</li>}
    </ul>
  );
}
