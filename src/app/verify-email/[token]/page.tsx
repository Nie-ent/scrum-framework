import Link from "next/link";
import type { Metadata } from "next";
import { verifyEmail } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "ยืนยันอีเมล", referrer: "no-referrer" };

export default async function VerifyEmailPage({ params }: PageProps<"/verify-email/[token]">) {
  const { token } = await params;
  const ok = await verifyEmail(token);
  return (
    <AuthShell>
      <div className="card space-y-3 text-center">
        <h2 className="font-semibold text-slate-900">{ok ? "ยืนยันอีเมลแล้ว" : "ลิงก์นี้ใช้ไม่ได้แล้ว"}</h2>
        <p className="text-sm text-slate-500">
          {ok ? "คำเชิญเข้าทีมที่ส่งถึงอีเมลนี้จะขึ้นในหน้า ทีม ให้กดรับได้เลย" : "ลิงก์หมดอายุหรือถูกใช้ไปแล้ว — ขอลิงก์ใหม่ได้ที่หน้า ทีม"}
        </p>
        <Link href="/teams" className="btn">ไปหน้า ทีม</Link>
      </div>
    </AuthShell>
  );
}
