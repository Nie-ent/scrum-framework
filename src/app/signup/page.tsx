import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { isSignupOpen } from "@/lib/invites";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "สมัครบัญชี" };

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  // มาจากลิงก์คำเชิญ (ตรวจ token จริงตอนกดสมัคร) หรือเปิดให้สมัครทั่วไป
  const nextPath = typeof next === "string" && next.startsWith("/invite/") ? next : undefined;
  const loginHref = nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login";
  return (
    <AuthShell>
      {isSignupOpen() || nextPath ? (
        <SignupForm next={nextPath} />
      ) : (
        <div className="card space-y-2 text-center">
          <h2 className="font-semibold text-slate-900">ยังไม่เปิดให้สมัครเอง</h2>
          <p className="text-sm text-slate-500">ขอลิงก์คำเชิญจากหัวหน้าทีมของคุณเพื่อสมัครและเข้าทีม</p>
        </div>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        มีบัญชีแล้ว? <Link href={loginHref} className="font-medium text-indigo-600 hover:text-indigo-800">เข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  );
}
