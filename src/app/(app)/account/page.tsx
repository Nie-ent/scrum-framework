import { requireUser } from "@/lib/auth";
import { teamsLabel } from "@/lib/permissions";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl space-y-6">
      <div><p className="eyebrow">Account settings</p><h1 className="page-title">บัญชีของฉัน</h1><p className="page-subtitle">ข้อมูลและการตั้งค่าการเข้าสู่ระบบของคุณ</p></div>
      <div className="card text-sm">
        <p className="eyebrow">Profile</p>
        <div className="text-lg font-semibold text-slate-950">{user.name}</div>
        <div className="mt-0.5 text-slate-500">{user.email}</div>
        <div className="mt-4 border-t border-slate-100 pt-4 text-slate-500">
          {user.role.name} · Lv {user.role.level} · {teamsLabel(user.memberships)}
        </div>
      </div>
      <PasswordForm />
    </div>
  );
}
