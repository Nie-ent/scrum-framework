import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "ตั้งรหัสผ่านใหม่", referrer: "no-referrer" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return (
    <AuthShell>
      <ResetForm token={token} />
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/forgot-password" className="hover:text-indigo-700">ขอลิงก์ใหม่</Link>
      </p>
    </AuthShell>
  );
}
