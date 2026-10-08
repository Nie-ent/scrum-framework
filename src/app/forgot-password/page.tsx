import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { isEmailConfigured } from "@/lib/email";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "ลืมรหัสผ่าน" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      {isEmailConfigured() ? (
        <ForgotForm />
      ) : (
        <div className="card space-y-2 text-center">
          <h2 className="font-semibold text-slate-900">ลืมรหัสผ่าน</h2>
          <p className="text-sm text-slate-500">ระบบยังไม่ได้เปิดการส่งอีเมล — ติดต่อผู้ดูแลระบบให้รีเซ็ตรหัสผ่านให้</p>
        </div>
      )}
      <p className="mt-4 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-800">← กลับไปเข้าสู่ระบบ</Link>
      </p>
    </AuthShell>
  );
}
