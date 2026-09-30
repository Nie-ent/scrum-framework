import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOverviewAccess } from "@/lib/auth";
import { canViewAllTeams, teamsLabel } from "@/lib/permissions";
import { getVisibleTeams, teamWithChildren, type TeamRow } from "@/lib/teams";
import { dateToKey, formatDateKey, isDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";

const TREND_DAYS = 7;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireOverviewAccess();
  const params = await searchParams;
  const today = todayKey();
  const dateKey = isDateKey(params.date) ? params.date : today;
  const allTeams = canViewAllTeams(viewer.role.level);
  const teams = await getVisibleTeams(viewer);

  // Manager เลือก "ทุกทีม" ได้ (teamId = ""), หัวหน้าทีมเริ่มที่ทีมแรกที่ตัวเองดูได้
  const requested = typeof params.team === "string" ? params.team : undefined;
  const teamId = teams.some((t) => t.id === requested) ? requested! : allTeams ? "" : teams[0]?.id ?? "";
  const scopeTeams = teamId ? teamWithChildren(teams, teamId) : teams;

  const trendStart = shiftKey(dateKey, -(TREND_DAYS - 1));
  const where: Prisma.UserWhereInput = teamId
    ? { active: true, memberships: { some: { teamId: { in: scopeTeams.map((t) => t.id) } } } }
    : { active: true };
  const members = await prisma.user.findMany({
    where,
    include: {
      role: true,
      memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } },
      standups: {
        where: { date: { gte: keyToDate(trendStart), lte: keyToDate(dateKey) } },
        orderBy: { date: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });

  const rows = members.map((m) => ({
    member: m,
    entry: m.standups.find((s) => dateToKey(s.date) === dateKey),
    days: new Set(m.standups.map((s) => dateToKey(s.date))),
  }));
  const submitted = rows.filter((r) => r.entry);
  const missing = rows.filter((r) => !r.entry);
  const withField = (key: "blockers" | "notWorking" | "workingWell") => submitted.filter((r) => r.entry![key]);
  const blockers = withField("blockers");
  const notWorking = withField("notWorking");
  const workingWell = withField("workingWell");
  const trendKeys = Array.from({ length: TREND_DAYS }, (_, i) => shiftKey(trendStart, i));

  // แยกการ์ดตามทีม (คนที่อยู่หลายทีมย่อยจะขึ้นในทุกทีมที่อยู่)
  type Row = (typeof rows)[number];
  const groups: { team: TeamRow | null; rows: Row[] }[] = scopeTeams
    .map((team) => ({ team, rows: rows.filter((r) => r.member.memberships.some((m) => m.teamId === team.id)) }))
    .filter((g) => g.rows.length > 0);
  if (!teamId) {
    const noTeam = rows.filter((r) => r.member.memberships.length === 0);
    if (noTeam.length > 0) groups.push({ team: null, rows: noTeam });
  }

  const href = (date: string) => `/dashboard?date=${date}${teamId ? `&team=${teamId}` : ""}`;
  const scopeLabel = teams.find((t) => t.id === teamId)?.name ?? "ทุกทีม";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">ภาพรวม Scrum</h1>
          <p className="text-sm text-slate-500">
            {scopeLabel} · {formatDateKey(dateKey)}
            {dateKey === today && " (วันนี้)"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="btn-ghost" href={href(shiftKey(dateKey, -1))}>← ก่อนหน้า</Link>
          <form className="flex gap-2" action="/dashboard">
            <input type="date" name="date" defaultValue={dateKey} max={today} className="input py-1.5" />
            <select name="team" defaultValue={teamId} className="input py-1.5">
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="ส่งแล้ว" value={`${submitted.length}/${rows.length}`} tone="indigo" />
        <Stat label="Blockers" value={blockers.length} tone="red" />
        <Stat label="Not work" value={notWorking.length} tone="amber" />
        <Stat label="Work well" value={workingWell.length} tone="emerald" />
      </div>

      {blockers.length > 0 && (
        <section className="card border-red-200">
          <h2 className="mb-3 font-semibold text-red-700">🚧 Blockers ที่ต้องช่วยปลดล็อก</h2>
          <ul className="space-y-2">
            {blockers.map(({ member, entry }) => (
              <li key={member.id} className="text-sm">
                <span className="font-medium">{member.name}:</span>{" "}
                <span className="whitespace-pre-wrap">{entry!.blockers}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FeedbackList title="อะไรที่ไม่เวิร์ก (Not work)" tone="text-amber-700" items={notWorking.map((r) => [r.member.name, r.entry!.notWorking!])} />
        <FeedbackList title="อะไรที่เวิร์ก (Work well)" tone="text-emerald-700" items={workingWell.map((r) => [r.member.name, r.entry!.workingWell!])} />
      </div>

      <section className="space-y-6">
        {groups.map(({ team, rows: groupRows }) => {
          const done = groupRows.filter((r) => r.entry);
          const groupBlockers = done.filter((r) => r.entry!.blockers).length;
          return (
            <div key={team?.id ?? "none"}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3">
                <h2 className="font-semibold">{team?.name ?? "ไม่มีทีม"}</h2>
                <span className="text-sm text-slate-500">
                  ส่งแล้ว {done.length}/{groupRows.length}
                  {groupBlockers > 0 && <span className="text-red-600"> · blockers {groupBlockers}</span>}
                </span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {done.map(({ member, entry }) => (
                  <div key={member.id} className="card">
                    <MemberHeader member={member} />
                    <StandupSections standup={entry!} only={["yesterday", "today", "blockers"]} />
                  </div>
                ))}
                {groupRows
                  .filter((r) => !r.entry)
                  .map(({ member }) => (
                    <div key={member.id} className="card border-dashed bg-slate-50/60">
                      <MemberHeader member={member} />
                      <p className="text-sm text-slate-400">ยังไม่ได้ส่ง</p>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
        {missing.length > 0 && (
          <div className="card mt-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-600">ยังไม่ส่ง ({missing.length})</h3>
            <div className="flex flex-wrap gap-2">
              {missing.map(({ member }) => (
                <Link key={member.id} href={`/dashboard/member/${member.id}`} className="rounded-full bg-slate-100 px-3 py-1 text-sm hover:bg-slate-200">
                  {member.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        {rows.length === 0 && <p className="text-sm text-slate-500">ไม่มีสมาชิกในขอบเขตนี้</p>}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-3 font-semibold">การส่ง {TREND_DAYS} วันล่าสุด</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-4 font-medium">สมาชิก</th>
              {trendKeys.map((k) => (
                <th key={k} className="px-1 text-center font-medium">
                  <Link href={href(k)} className="hover:text-blue-600">{k.slice(8)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, days }) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-4">
                  <Link href={`/dashboard/member/${member.id}`} className="hover:text-blue-600">{member.name}</Link>
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
  const color = { indigo: "text-blue-600", red: "text-red-600", amber: "text-amber-600", emerald: "text-emerald-600" }[tone];
  return (
    <div className="card py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-3xl font-semibold ${color}`}>{value}</div>
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

type MemberInfo = {
  id: string;
  name: string;
  role: { name: string };
  memberships: { isLead: boolean; team: { name: string } }[];
};

function MemberHeader({ member }: { member: MemberInfo }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <Link href={`/dashboard/member/${member.id}`} className="font-medium hover:text-blue-600">{member.name}</Link>
      <span className="text-right text-xs text-slate-500">
        {member.role.name} · {teamsLabel(member.memberships)}
      </span>
    </div>
  );
}
