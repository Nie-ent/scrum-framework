import Link from "next/link";
import type { Metadata } from "next";
import { respondToInvite } from "@/app/actions/teams";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { openInvite } from "@/lib/invites";
import { ACCESS_LABEL, canLead } from "@/lib/permissions";
import { CreateTeamForm, LeaveTeamButton, VerifyEmailButton } from "./forms";

export const metadata: Metadata = { title: "ทีม" };

export default async function TeamsPage() {
  const user = await requireUser();
  // คำเชิญที่ส่งถึงอีเมลนี้ — เห็นรายละเอียดและกดรับในแอปได้เมื่อยืนยันแล้วว่าเป็นเจ้าของอีเมล
  // (ยังไม่ยืนยัน = บอกแค่ว่ามีคำเชิญรออยู่ ไม่เปิดเผยชื่อทีม/คนเชิญให้คนที่อาจไม่ใช่เจ้าของอีเมล)
  const verified = Boolean(user.emailVerifiedAt);
  const pending = await prisma.invite.findMany({
    where: { email: user.email, ...openInvite() },
    include: { team: { select: { name: true } }, invitedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const invites = verified ? pending : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">Your teams</p>
          <h1 className="page-title">ทีม</h1>
          <p className="page-subtitle">ทีมที่คุณอยู่ คำเชิญที่รอรับ และสร้างทีมใหม่</p>
        </div>
      </div>

      {pending.length > 0 && (
        <section className="card border-indigo-200 bg-indigo-50/40">
          <h2 className="mb-3 font-semibold text-slate-900">คำเชิญที่รอคุณ ({pending.length})</h2>
          {!verified && (
            <div className="mb-3 space-y-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <p>ยืนยันอีเมล {user.email} ก่อนจึงจะกดรับในแอปได้ — หรือเปิดลิงก์คำเชิญที่ได้รับเพื่อเข้าทีมได้เลย</p>
              {isEmailConfigured() && <VerifyEmailButton />}
            </div>
          )}
          <ul className="divide-y divide-indigo-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{i.team.name}</p>
                  <p className="text-xs text-slate-500">
                    {i.invitedBy ? `${i.invitedBy.name} เชิญ` : "ได้รับเชิญ"}เป็น{ACCESS_LABEL[i.access]}
                    {i.title && ` · ${i.title}`}
                  </p>
                </div>
                <form action={respondToInvite} className="flex gap-2">
                  <input type="hidden" name="id" value={i.id} />
                  <button className="btn min-h-9 px-3 py-1 text-sm">รับคำเชิญ</button>
                  <button name="decline" value="1" className="btn-ghost min-h-9 px-3 py-1 text-sm">ปฏิเสธ</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="mb-1 font-semibold text-slate-900">ทีมของฉัน</h2>
        {user.memberships.length === 0 ? (
          <p className="text-sm text-slate-500">คุณยังไม่ได้อยู่ในทีมไหน — สร้างทีมใหม่ด้านล่าง หรือขอให้หัวหน้าทีมส่งคำเชิญมา</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {user.memberships.map((m) => (
              <li key={m.teamId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{m.team.name}</p>
                  <p className="text-xs text-slate-500">
                    {ACCESS_LABEL[m.access]}
                    {m.title && ` · ${m.title}`}
                    {!m.participates && " · ไม่ต้องเช็กอิน"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canLead(m) ? (
                    <Link href={`/teams/${m.teamId}`} className="btn-ghost min-h-9 px-3 py-1 text-sm">จัดการทีม</Link>
                  ) : (
                    <LeaveTeamButton teamId={m.teamId} userId={user.id} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="mb-4">
          <p className="eyebrow">New team</p>
          <h2 className="font-semibold text-slate-900">สร้างทีมใหม่</h2>
          <p className="mt-1 text-sm text-slate-500">คุณจะเป็นเจ้าของทีม เชิญคนเข้าทีมและกำหนดสิทธิ์ได้เอง</p>
        </div>
        <CreateTeamForm />
      </section>
    </div>
  );
}
