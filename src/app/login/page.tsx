import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { isSignupOpen } from "@/lib/invites";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  return (
    <AuthShell>
      <LoginForm next={nextPath} />
      <p className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-slate-500">
        <Link href="/forgot-password" className="hover:text-indigo-700">ลืมรหัสผ่าน?</Link>
        {(isSignupOpen() || nextPath) && (
          <Link href={nextPath ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"} className="font-medium text-indigo-600 hover:text-indigo-800">สมัครบัญชีใหม่</Link>
        )}
      </p>
    </AuthShell>
  );
}
