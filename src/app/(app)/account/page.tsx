import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { teamsLabel } from "@/lib/permissions";
import { pushPublicKey } from "@/lib/push";
import { NotificationSettings } from "./notification-settings";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl space-y-6">
      <div><p className="eyebrow">Account settings</p><h1 className="page-title">บัญชีของฉัน</h1><p className="page-subtitle">ข้อมูลและการตั้งค่าการเข้าสู่ระบบของคุณ</p></div>
      <ProfileForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUpdatedAt: user.avatarUpdatedAt,
          summary: `${user.role.name} · Lv ${user.role.level} · ${teamsLabel(user.memberships)}`,
        }}
      />
      <NotificationSettings publicKey={pushPublicKey()} />
      <PasswordForm />
      <form action={logout} className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">ออกจากระบบ</h2>
          <p className="text-sm text-slate-500">ออกจากบัญชีนี้บนอุปกรณ์เครื่องนี้</p>
        </div>
        <button className="btn-ghost shrink-0 border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50">ออกจากระบบ</button>
      </form>
    </div>
  );
}
