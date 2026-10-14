import Link from "next/link";
import { LabelAdmin } from "./label-admin";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { revokeInvite } from "@/app/actions/teams";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format-dates";
import { isEmailConfigured } from "@/lib/email";
import { openInvite } from "@/lib/invites";
import { ACCESS_LABEL } from "@/lib/permissions";
import { getTeamControl } from "@/lib/teams";
import { Avatar } from "@/components/avatar";
import { DeleteTeamForm, InviteForm, MeetingUrlForm, MemberForm, SubTeamForm } from "../forms";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("จัดการทีม") };
}

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
  const labels = await prisma.label
    .findMany({ where: { teamId: team.id }, select: { id: true, name: true, color: true, _count: { select: { tasks: true } } }, orderBy: { name: "asc" } })
    .then((rows) => rows.map((l) => ({ id: l.id, name: l.name, color: l.color, tasks: l._count.tasks })));
  const titles = [...new Set(members.flatMap((m) => (m.title ? [m.title] : [])))].sort();

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/teams" className="text-sm text-slate-500 hover:text-indigo-600">{tr("← ทีมทั้งหมด")}</Link>
        <div className="page-header mt-2">
          <div>
            <p className="eyebrow">{parent ? tr("ทีมย่อยของ {0}", [parent.name]) : tr("ตั้งค่าทีม")}</p>
            <h1 className="page-title">{team.name}</h1>
            <p className="page-subtitle">{tr("{0} คน", [members.length])}{invites.length > 0 && tr(" · รอรับคำเชิญ {0}", [invites.length])}</p>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="mb-4">
          <p className="eyebrow">{tr("เชิญ")}</p>
          <h2 className="font-semibold text-slate-900">{tr("เชิญคนเข้าทีม")}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {isEmailConfigured() ? tr("ระบบจะส่งอีเมลคำเชิญให้ และ") : tr("ระบบจะสร้างลิงก์ให้คัดลอกส่งเอง และ")}{tr("ถ้าเขามีบัญชีอยู่แล้วจะเห็นคำเชิญในหน้า ทีม ของเขา กดรับได้เลย · พิมพ์ในช่องอีเมลเพื่อเลือกจากคนที่เคยร่วมทีมกัน")}
          </p>
        </div>
        <InviteForm teamId={team.id} canInviteLead={owner} contacts={contacts} titles={titles} />
        {invites.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="break-all font-medium text-slate-800">{i.email}</span>
                  <span className="text-xs text-slate-500"> · {tr(ACCESS_LABEL[i.access])}{i.title && ` · ${i.title}`} {tr("· หมดอายุ")}{" "}{formatDateTime(i.expiresAt)}</span>
                </div>
                <form action={revokeInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <button className="shrink-0 whitespace-nowrap text-xs text-slate-400 transition hover:text-rose-600">{tr("ยกเลิกคำเชิญ")}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold text-slate-900">{tr("สมาชิก")}</h2>
        {!owner && <p className="mb-2 text-sm text-slate-500">{tr("เฉพาะเจ้าของทีมแก้สิทธิ์และบทบาทได้")}</p>}
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.userId} className="grid gap-x-4 gap-y-2 py-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar user={m.user} size={36} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{m.user.name}{!m.user.active && <span className="ml-2 badge badge-neutral">{tr("ปิดบัญชี")}</span>}</p>
                  <p className="truncate text-xs text-slate-500">{m.user.email}</p>
                </div>
              </div>
              {owner ? (
                <MemberForm
                  teamId={team.id}
                  self={m.userId === user.id}
                  titles={titles}
                  member={{ userId: m.userId, name: m.user.name, access: m.access, title: m.title, participates: m.participates }}
                />
              ) : (
                <p className="text-xs text-slate-500">{tr(ACCESS_LABEL[m.access])}{m.title && ` · ${m.title}`}{!m.participates && tr(" · ไม่ต้องเช็กอิน")}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {owner && (
        <section className="card">
          <h2 className="mb-1 font-semibold text-slate-900">{tr("ห้องประชุมของทีม")}</h2>
          <p className="mb-3 text-sm text-slate-500">
            {tr("วางลิงก์ Google Meet, Zoom หรือห้องประชุมอื่นที่ทีมใช้ประจำ สมาชิกจะเห็นปุ่ม \"เข้าห้องประชุม\" ในหน้า เช็กอิน และภาพรวมทีม")}
            {team.parentId && tr(" · ถ้าเว้นว่าง จะใช้ลิงก์ของทีมแม่")}
          </p>
          <MeetingUrlForm teamId={team.id} meetingUrl={team.meetingUrl} />
        </section>
      )}

      <section className="card">
        <h2 className="mb-1 font-semibold text-foreground">{tr("ป้ายกำกับงาน")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{tr("ใช้จัดกลุ่มและกรองงาน สมาชิกสร้างป้ายจากหน้างานได้ หัวหน้าแก้ชื่อ สี หรือลบได้ที่นี่")}{!team.parentId && tr(" · ทีมย่อยใช้ป้ายของทีมนี้ได้ด้วย")}</p>
        <LabelAdmin teamId={team.id} labels={labels} />
      </section>

      {!team.parentId && (
        <section className="card">
          <h2 className="mb-1 font-semibold text-slate-900">{tr("ทีมย่อย")}</h2>
          <p className="mb-3 text-sm text-slate-500">{tr("หัวหน้าและเจ้าของทีมนี้เห็นภาพรวมของทีมย่อยทั้งหมด")}</p>
          {children.length > 0 && (
            <ul className="mb-4 divide-y divide-slate-100">
              {children.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name} <span className="text-xs font-normal text-slate-500">· {tr("{0} คน", [c._count.members])}</span></span>
                  <Link href={`/teams/${c.id}`} className="shrink-0 whitespace-nowrap text-sm font-semibold text-indigo-600 hover:text-indigo-800">{tr("จัดการ →")}</Link>
                </li>
              ))}
            </ul>
          )}
          {owner && <SubTeamForm teamId={team.id} />}
        </section>
      )}

      {owner && (
        <section className="card border-rose-200">
          <p className="eyebrow text-rose-600">{tr("โปรดระวัง")}</p>
          <h2 className="font-semibold text-slate-900">{tr("ลบทีม")}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">
            {tr("ลบทีมนี้พร้อมงาน เช็กอิน ความคิดเห็น ไฟล์แนบ และคำเชิญทั้งหมดของทีม")}{" "}<b className="font-semibold text-rose-700">{tr("กู้คืนไม่ได้")}</b> {tr("· บัญชีของสมาชิกไม่ถูกลบ")}
            {children.length > 0 && tr(" · ต้องลบทีมย่อยทั้งหมดก่อน")}
          </p>
          <DeleteTeamForm teamId={team.id} teamName={team.name} />
        </section>
      )}
    </div>
  );
}
