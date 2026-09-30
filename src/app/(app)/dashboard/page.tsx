import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEVEL, canViewAllTeams } from "@/lib/permissions";
import { visibleUsersWhere } from "@/lib/scope";
import { dateToKey, formatDateKey, isDateKey, keyToDate, shiftKey, todayKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";

const TREND_DAYS = 7;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const viewer = await requireUser(LEVEL.LEAD);
  const params = await searchParams;
  const today = todayKey();
  const dateKey = isDateKey(params.date) ? params.date : today;
  const allTeams = canViewAllTeams(viewer.role.level);
  const teamId = allTeams && typeof params.team === "string" && params.team ? params.team : undefined;

  const trendStart = shiftKey(dateKey, -(TREND_DAYS - 1));
  const [members, teams] = await Promise.all([
    prisma.user.findMany({
      where: visibleUsersWhere(viewer, teamId),
      include: {
        role: true,
        team: true,
        standups: {
          where: { date: { gte: keyToDate(trendStart), lte: keyToDate(dateKey) } },
          orderBy: { date: "desc" },
        },
      },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
    }),
    allTeams ? prisma.team.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

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

  const href = (date: string) => `/dashboard?date=${date}${teamId ? `&team=${teamId}` : ""}`;
  const scopeLabel = allTeams
    ? teams.find((t) => t.id === teamId)?.name ?? "ทุกทีม"
    : viewer.team?.name ?? "ยังไม่ได้อยู่ในทีม";

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
            {allTeams && (
              <select name="team" defaultValue={teamId ?? ""} className="input py-1.5">
                <option value="">ทุกทีม</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
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

      <section>
        <h2 className="mb-3 font-semibold">รายคน</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {submitted.map(({ member, entry }) => (
            <div key={member.id} className="card">
              <MemberHeader member={member} />
              <StandupSections standup={entry!} only={["yesterday", "today", "blockers"]} />
            </div>
          ))}
        </div>
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
                  <Link href={href(k)} className="hover:text-indigo-600">{k.slice(8)}</Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ member, days }) => (
              <tr key={member.id} className="border-t border-slate-100">
                <td className="py-1.5 pr-4">
                  <Link href={`/dashboard/member/${member.id}`} className="hover:text-indigo-600">{member.name}</Link>
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
  const color = { indigo: "text-indigo-600", red: "text-red-600", amber: "text-amber-600", emerald: "text-emerald-600" }[tone];
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

function MemberHeader({ member }: { member: { id: string; name: string; role: { name: string }; team: { name: string } | null } }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <Link href={`/dashboard/member/${member.id}`} className="font-medium hover:text-indigo-600">{member.name}</Link>
      <span className="text-xs text-slate-500">
        {member.role.name}
        {member.team && ` · ${member.team.name}`}
      </span>
    </div>
  );
}
