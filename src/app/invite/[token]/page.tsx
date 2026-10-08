import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openInvite } from "@/lib/invites";
import { ACCESS_LABEL } from "@/lib/permissions";
import { hashToken } from "@/lib/tokens";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "คำเชิญเข้าทีม", referrer: "no-referrer" };

/** หน้าลิงก์คำเชิญ — เปิดได้ทั้งตอน login แล้วและยังไม่ login */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [invite, user] = await Promise.all([
    prisma.invite.findFirst({
      where: { tokenHash: hashToken(token), ...openInvite() },
      include: { team: { select: { name: true } }, invitedBy: { select: { name: true } } },
    }),
    getCurrentUser(),
  ]);
  const next = encodeURIComponent(`/invite/${token}`);

  return (
    <AuthShell>
      {!invite ? (
        <div className="card space-y-3 text-center">
          <h2 className="font-semibold text-slate-900">คำเชิญนี้ใช้ไม่ได้แล้ว</h2>
          <p className="text-sm text-slate-500">ลิงก์หมดอายุ ถูกยกเลิก หรือถูกใช้ไปแล้ว — ขอให้หัวหน้าทีมส่งคำเชิญใหม่</p>
          <Link href="/" className="btn-ghost">ไปหน้าแรก</Link>
        </div>
      ) : (
        <div className="card space-y-4">
          <div>
            <p className="eyebrow">Team invite</p>
            <h2 className="text-xl font-semibold text-slate-950">เข้าร่วมทีม {invite.team.name}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {invite.invitedBy ? `${invite.invitedBy.name} เชิญคุณ` : "คุณได้รับเชิญ"}เป็น{ACCESS_LABEL[invite.access]}
              {invite.title && ` · ${invite.title}`}
            </p>
          </div>
          {user ? (
            <>
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">เข้าทีมด้วยบัญชี <b>{user.name}</b> ({user.email})</p>
              <AcceptForm token={token} />
            </>
          ) : (
            <div className="grid gap-2">
              <Link href={`/signup?next=${next}`} className="btn w-full">สมัครบัญชีใหม่เพื่อเข้าทีม</Link>
              <Link href={`/login?next=${next}`} className="btn-ghost w-full">มีบัญชีแล้ว — เข้าสู่ระบบ</Link>
            </div>
          )}
        </div>
      )}
    </AuthShell>
  );
}
