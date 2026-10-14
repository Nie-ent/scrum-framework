import Link from "next/link";
import type { Metadata } from "next";
import { respondToInvite } from "@/app/actions/teams";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { openInvite } from "@/lib/invites";
import { ACCESS_LABEL, canLead } from "@/lib/permissions";
import { CreateTeamForm, LeaveTeamButton, VerifyEmailButton } from "./forms";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("ทีม") };
}

export default async function TeamsPage({ searchParams }: PageProps<"/teams">) {
  const user = await requireUser();
  const { full } = await searchParams;
  // คำเชิญที่ส่งถึงอีเมลนี้ — เห็นรายละเอียดและกดรับในแอปได้เมื่อยืนยันแล้วว่าเป็นเจ้าของอีเมล
  // (ยังไม่ยืนยัน = บอกแค่ว่ามีคำเชิญรออยู่ ไม่เปิดเผยชื่อทีม/คนเชิญให้คนที่อาจไม่ใช่เจ้าของอีเมล)
  const verified = Boolean(user.emailVerifiedAt);
  const pending = await prisma.invite.findMany({
    where: { email: user.email, ...openInvite() },
    include: { team: { select: { name: true } }, invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const invites = verified ? pending : [];
  const personal = user.memberships.find((m) => m.team.personalOfId);
  const teamMemberships = user.memberships.filter((m) => !m.team.personalOfId);

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">{tr("ทำงานร่วมกัน")}</p>
          <h1 className="page-title">{tr("ทีม")}</h1>
          <p className="page-subtitle">{tr("ทีมที่คุณอยู่ คำเชิญที่รอรับ และสร้างทีมใหม่")}</p>
        </div>
      </div>

      {full && (
        <p role="alert" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground">{tr("ที่นั่งในแพ็กเกจเต็มแล้ว — เจ้าของทีมเพิ่มที่นั่งได้ที่หน้าจัดการทีม")}</p>
      )}

      {pending.length > 0 && (
        <section className="card border-indigo-200 bg-indigo-50/40">
          <h2 className="mb-3 font-semibold text-slate-900">{tr("คำเชิญที่รอคุณ (")}{pending.length})</h2>
          {!verified && (
            <div className="mb-3 space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>{tr("ยืนยันอีเมล")}{" "}{user.email} {tr("ก่อนจึงจะกดรับในแอปได้ — หรือเปิดลิงก์คำเชิญที่ได้รับเพื่อเข้าทีมได้เลย")}</p>
              {isEmailConfigured() && <VerifyEmailButton />}
            </div>
          )}
          <ul className="divide-y divide-indigo-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-slate-800">{i.team.name}</p>
                  <p className="text-xs text-slate-500">
                    {i.invitedBy ? tr("{0} เชิญ", [i.invitedBy.name]) : tr("ได้รับเชิญ")}{tr("เป็น")}{tr(ACCESS_LABEL[i.access])}
                    {i.title && ` · ${i.title}`}
                  </p>
                </div>
                <form action={respondToInvite} className="flex shrink-0 gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn min-h-9 px-3 py-1 text-sm">{tr("รับคำเชิญ")}</button>
                  <button name="decline" value="1" className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("ปฏิเสธ")}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-semibold text-slate-900">{tr("พื้นที่ส่วนตัว")}</h2>
          <p className="text-sm text-slate-500">{tr("งาน บันทึกประจำวัน และโน้ตที่เห็นเฉพาะคุณ — ใช้ได้เลยโดยไม่ต้องมีทีม")}</p>
        </div>
        {personal && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/tasks?team=${personal.teamId}`} className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("งาน")}</Link>
            <Link href={`/standup?team=${personal.teamId}`} className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("บันทึกประจำวัน")}</Link>
            <Link href={`/notes?team=${personal.teamId}`} className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("โน้ต")}</Link>
          </div>
        )}
      </section>

      <section data-tour="team-mine" className="card">
        <h2 className="mb-1 font-semibold text-slate-900">{tr("ทีมของฉัน")}</h2>
        {teamMemberships.length === 0 ? (
          <p className="text-sm text-slate-500">{tr("คุณยังไม่ได้อยู่ในทีมไหน — ใช้พื้นที่ส่วนตัวได้เลย หรือสร้างทีมใหม่ด้านล่างเพื่อทำงานร่วมกับคนอื่น")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teamMemberships.map((m) => (
              <li key={m.teamId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800">{m.team.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {tr(ACCESS_LABEL[m.access])}
                    {m.title && ` · ${m.title}`}
                    {!m.participates && tr(" · ไม่ต้องเช็กอิน")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {canLead(m) ? (
                    <Link href={`/teams/${m.teamId}`} className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("จัดการทีม")}</Link>
                  ) : (
                    <LeaveTeamButton teamId={m.teamId} userId={user.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-tour="team-new" className="card">
        <div className="mb-4">
          <p className="eyebrow">{tr("ทีมใหม่")}</p>
          <h2 className="font-semibold text-slate-900">{tr("สร้างทีมใหม่")}</h2>
          <p className="mt-1 text-sm text-slate-500">{tr("คุณจะเป็นเจ้าของทีม เชิญคนเข้าทีมและกำหนดสิทธิ์ได้เอง")}</p>
        </div>
        <CreateTeamForm />
      </section>
    </div>
  );
}
