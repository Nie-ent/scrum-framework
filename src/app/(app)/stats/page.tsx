import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { todayKey } from "@/lib/dates";
import { teamParticipation, type MemberStats } from "@/lib/stats";
import { getVisibleTeams, sortTeamTree } from "@/lib/teams";
import { pickSpace } from "@/lib/space";
import { Avatar } from "@/components/avatar";
import { ProgressBar } from "@/components/standup-card";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "สถิติการมีส่วนร่วม" };

const PERIODS = [7, 30, 90] as const;

/** สถิติการมีส่วนร่วม: ทุกคนเห็นของตัวเองและค่าเฉลี่ยทีม — หัวหน้า/เจ้าของทีมเห็นรายคน */
export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayKey();

  const manageable = await getVisibleTeams(user);
  const manageableIds = new Set(manageable.map((t) => t.id));
  const teams = sortTeamTree([
    ...manageable,
    ...user.memberships.map((m) => m.team).filter((t) => !manageableIds.has(t.id)),
  ]);
  if (teams.length === 0) {
    return <EmptyState title="คุณยังไม่ได้อยู่ในทีมไหน" description="สถิติคิดจากเช็กอินและงานภายในทีม — สร้างทีมหรือรับคำเชิญเข้าทีมก่อน" action={{ href: "/teams", label: "ไปหน้า ทีม" }} />;
  }
  const team = (await pickSpace(teams, params.team))!;
  const canLead = manageableIds.has(team.id);
  const days = PERIODS.find((p) => String(p) === params.days) ?? 30;

  const rows = await teamParticipation(team.id, today, days);
  const me = rows.find((r) => r.userId === user.id);
  const rated = rows.filter((r) => r.rate !== null);
  const teamRate = rated.length === 0 ? null : Math.round(rated.reduce((sum, r) => sum + r.rate!, 0) / rated.length);
  const total = (key: "tasksDone" | "comments" | "blockers" | "tasksOverdue") => rows.reduce((sum, r) => sum + r[key], 0);
  const href = (teamId: string, d: number) => `/stats?team=${teamId}&days=${d}`;
  const tab = (active: boolean) =>
    `inline-flex min-h-9 items-center rounded-xl px-3 text-sm transition ${active ? "bg-white font-semibold text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-950"}`;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">ความสม่ำเสมอ</p>
          <h1 className="page-title">สถิติการมีส่วนร่วม</h1>
          <p className="page-subtitle">{team.name} · {days} วันล่าสุด · นับเฉพาะวันจันทร์–ศุกร์</p>
        </div>
        <nav aria-label="ช่วงเวลา" className="flex rounded-2xl bg-slate-100 p-1">
          {PERIODS.map((p) => (
            <Link key={p} href={href(team.id, p)} aria-current={p === days ? "true" : undefined} className={tab(p === days)}>{p} วัน</Link>
          ))}
        </nav>
      </div>


      {me && (
        <section>
          <h2 className="mb-3 font-semibold text-slate-900">ของฉัน</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="เช็กอิน" value={me.rate === null ? "—" : `${me.rate}%`} hint={`${me.submitted} จาก ${me.expected} วันทำงาน`} tone="text-indigo-600" />
            <Stat label="ส่งต่อเนื่อง" value={`${me.streak} วัน`} hint="วันทำงานติดต่อกันล่าสุด" tone="text-emerald-600" />
            <Stat label="งานที่ทำเสร็จ" value={me.tasksDone} hint={<>ค้างอยู่ {me.tasksOpen}{me.tasksOverdue > 0 && <> · <Link href={`/tasks?team=${team.id}&overdue=1&who=${user.id}`} className="font-medium text-danger underline-offset-2 hover:underline">เลยกำหนด {me.tasksOverdue} ›</Link></>}</>} tone="text-slate-900" />
            <Stat label="ความคิดเห็น" value={me.comments} hint={`ขอความช่วยเหลือ ${me.blockers} ครั้ง`} tone="text-slate-900" />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold text-slate-900">ทั้งทีม</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="เช็กอินเฉลี่ย" value={teamRate === null ? "—" : `${teamRate}%`} hint={`${rows.length} คนที่ต้องเช็กอิน`} tone="text-indigo-600" />
          <Stat label="งานที่ทำเสร็จ" value={total("tasksDone")} hint={total("tasksOverdue") > 0 ? <Link href={`/tasks?team=${team.id}&overdue=1`} className="font-medium text-danger underline-offset-2 hover:underline">เลยกำหนด {total("tasksOverdue")} งาน ›</Link> : "ไม่มีงานเลยกำหนด"} tone="text-slate-900" />
          <Stat label="ความคิดเห็น" value={total("comments")} hint="ใต้งานและเช็กอิน" tone="text-slate-900" />
          <Stat label="ขอความช่วยเหลือ" value={total("blockers")} hint="จำนวนเช็กอินที่ขอความช่วยเหลือ" tone="text-rose-600" />
        </div>
      </section>

      {canLead &&
        (rows.length === 0 ? (
          <EmptyState title="ยังไม่มีสมาชิกที่ต้องเช็กอิน" description="เชิญคนเข้าทีมจากหน้าจัดการทีม สถิติรายคนจะแสดงที่นี่" action={{ href: `/teams/${team.id}`, label: "จัดการทีม" }} />
        ) : (
          <section className="space-y-3">
            <div>
              <h2 className="font-semibold text-slate-900">รายคน</h2>
              <p className="text-sm text-slate-500">เห็นเฉพาะหัวหน้าและเจ้าของทีม · ใช้ดูว่าใครอาจต้องการความช่วยเหลือ ไม่ใช่คะแนนประเมินผลงาน</p>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">สมาชิก</th>
                    <th className="px-4 py-3">เช็กอิน</th>
                    <th className="px-4 py-3 text-right">ต่อเนื่อง</th>
                    <th className="px-4 py-3 text-right">งานเสร็จ</th>
                    <th className="px-4 py-3 text-right">งานค้าง</th>
                    <th className="px-4 py-3 text-right">ความคิดเห็น</th>
                    <th className="px-5 py-3 text-right">ขอความช่วยเหลือ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...rows].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).map((r) => <Row key={r.userId} row={r} teamId={team.id} />)}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint: React.ReactNode; tone: string }) {
  return (
    <div className="card py-4">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Row({ row: r, teamId }: { row: MemberStats; teamId: string }) {
  return (
    <tr className="transition hover:bg-indigo-50/40">
      <td className="px-5 py-3">
        <div className="flex items-center gap-3">
          <Avatar user={{ id: r.userId, name: r.name, avatarUpdatedAt: r.avatarUpdatedAt }} size={32} />
          <div className="min-w-0">
            <Link href={`/dashboard/member/${r.userId}`} className="font-semibold text-slate-800 hover:text-indigo-700">{r.name}</Link>
            {r.title && <p className="text-xs text-slate-500">{r.title}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {r.rate === null ? (
          <span className="text-slate-400">ยังไม่มีวันทำงาน</span>
        ) : (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <ProgressBar percent={r.rate} className="w-20" />
            <span className="text-xs font-semibold tabular-nums text-slate-700">{r.rate}%</span>
            <span className="text-xs tabular-nums text-slate-400">{r.submitted}/{r.expected}</span>
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.streak} วัน</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.tasksDone}</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
        {/* ป้ายอยู่ซ้ายของตัวเลข — ตัวเลขจึงชิดขวาตรงกันทุกแถว */}
        <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
          {r.tasksOverdue > 0 && <Link href={`/tasks?team=${teamId}&overdue=1&who=${r.userId}`} title="ดูงานที่เลยกำหนด" className="badge badge-danger transition hover:brightness-95">เลยกำหนด {r.tasksOverdue} ›</Link>}
          {r.tasksOpen}
        </span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.comments}</td>
      <td className="px-5 py-3 text-right tabular-nums text-slate-700">{r.blockers}</td>
    </tr>
  );
}
