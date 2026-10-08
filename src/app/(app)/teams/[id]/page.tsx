import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { revokeInvite } from "@/app/actions/teams";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { isEmailConfigured } from "@/lib/email";
import { openInvite } from "@/lib/invites";
import { ACCESS_LABEL } from "@/lib/permissions";
import { getTeamControl } from "@/lib/teams";
import { Avatar } from "@/components/avatar";
import { InviteForm, MemberForm, SubTeamForm } from "../forms";

export const metadata: Metadata = { title: "จัดการทีม" };

/** จัดการทีม: สมาชิก สิทธิ์ ชื่อบทบาท คำเชิญ และทีมย่อย — เข้าได้เฉพาะหัวหน้า/เจ้าของทีม */
export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const control = await getTeamControl(user, id);
  if (!control?.lead) notFound();
  const { team, owner } = control;

  const myTeamIds = user.memberships.map((m) => m.teamId);
  const [members, invites, children, parent, sent, teammates] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId: team.id },
      include: { user: { select: { id: true, name: true, email: true, active: true, avatarUpdatedAt: true } } },
      orderBy: [{ access: "asc" }, { user: { name: "asc" } }],
    }),
    prisma.invite.findMany({ where: { teamId: team.id, ...openInvite() }, include: { invitedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.team.findMany({ where: { parentId: team.id }, select: { id: true, name: true, _count: { select: { members: true } } }, orderBy: { name: "asc" } }),
    team.parentId ? prisma.team.findUnique({ where: { id: team.parentId }, select: { id: true, name: true } }) : null,
    // คนที่ฉันเคยเชิญ (รับแล้ว) และคนที่อยู่ทีมเดียวกับฉัน = รายชื่อให้เลือกเชิญ
    prisma.invite.findMany({ where: { invitedById: user.id, acceptedAt: { not: null } }, select: { acceptedBy: { select: { email: true, name: true } } }, take: 200 }),
    prisma.user.findMany({ where: { active: true, memberships: { some: { teamId: { in: myTeamIds } } } }, select: { email: true, name: true }, take: 200 }),
  ]);
  const inTeam = new Set(members.map((m) => m.user.email));
  const contacts = [...new Map([...sent.flatMap((s) => (s.acceptedBy ? [s.acceptedBy] : [])), ...teammates].map((c) => [c.email, c])).values()]
    .filter((c) => !inTeam.has(c.email))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  const titles = [...new Set(members.flatMap((m) => (m.title ? [m.title] : [])))].sort();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/teams" className="text-sm text-slate-500 hover:text-indigo-600">← ทีมทั้งหมด</Link>
        <div className="page-header mt-2">
          <div>
            <p className="eyebrow">{parent ? `ทีมย่อยของ ${parent.name}` : "Team settings"}</p>
            <h1 className="page-title">{team.name}</h1>
            <p className="page-subtitle">{members.length} คน{invites.length > 0 && ` · รอรับคำเชิญ ${invites.length}`}</p>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="mb-4">
          <p className="eyebrow">Invite</p>
          <h2 className="font-semibold text-slate-900">เชิญคนเข้าทีม</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isEmailConfigured() ? "ระบบจะส่งอีเมลคำเชิญให้ และ" : "ระบบจะสร้างลิงก์ให้คัดลอกส่งเอง และ"}ถ้าเขามีบัญชีอยู่แล้วจะเห็นคำเชิญในหน้า ทีม ของเขา กดรับได้เลย · พิมพ์ในช่องอีเมลเพื่อเลือกจากคนที่เคยร่วมทีมกัน
          </p>
        </div>
        <InviteForm teamId={team.id} canInviteLead={owner} contacts={contacts} titles={titles} />
        {invites.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{i.email}</span>
                  <span className="text-xs text-slate-500"> · {ACCESS_LABEL[i.access]}{i.title && ` · ${i.title}`} · หมดอายุ {formatDateTime(i.expiresAt)}</span>
                </div>
                <form action={revokeInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="text-xs text-slate-400 transition hover:text-rose-600">ยกเลิกคำเชิญ</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold text-slate-900">สมาชิก</h2>
        {!owner && <p className="mb-2 text-sm text-slate-500">เฉพาะเจ้าของทีมแก้สิทธิ์และบทบาทได้</p>}
        <datalist id="team-titles-edit">{titles.map((t) => <option key={t} value={t} />)}</datalist>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={m.user} size={36} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{m.user.name}{!m.user.active && <span className="ml-2 badge badge-neutral">ปิดบัญชี</span>}</p>
                  <p className="truncate text-xs text-slate-500">{m.user.email}</p>
                </div>
              </div>
              {owner ? (
                <MemberForm
                  teamId={team.id}
                  self={m.userId === user.id}
                  member={{ userId: m.userId, name: m.user.name, access: m.access, title: m.title, participates: m.participates }}
                />
              ) : (
                <p className="text-xs text-slate-500">{ACCESS_LABEL[m.access]}{m.title && ` · ${m.title}`}{!m.participates && " · ไม่ต้องเช็กอิน"}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!team.parentId && (
        <section className="card">
          <h2 className="mb-1 font-semibold text-slate-900">ทีมย่อย</h2>
          <p className="mb-3 text-sm text-slate-500">หัวหน้าและเจ้าของทีมนี้เห็นภาพรวมของทีมย่อยทั้งหมด</p>
          {children.length > 0 && (
            <ul className="mb-4 divide-y divide-slate-100">
              {children.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="font-medium text-slate-800">{c.name} <span className="text-xs font-normal text-slate-500">· {c._count.members} คน</span></span>
                  <Link href={`/teams/${c.id}`} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">จัดการ →</Link>
                </li>
              ))}
            </ul>
          )}
          {owner && <SubTeamForm teamId={team.id} />}
        </section>
      )}
    </div>
  );
}
