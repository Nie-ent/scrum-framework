import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireUser } from "@/lib/auth";
import { canAdmin, teamsLabel } from "@/lib/permissions";
import { pushPublicKey } from "@/lib/push";
import type { Metadata } from "next";
import { isEmailConfigured } from "@/lib/email";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/email";
import { formatDateTime } from "@/lib/format-dates";
import { AiConnect } from "./ai-connect";
import { EmailSettings } from "./email-settings";
import { NotificationSettings } from "./notification-settings";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { ensureLang, tr } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/language-switch";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("บัญชีของฉัน") };
}

export default async function AccountPage() {
  const user = await requireUser();
  const tokens = await prisma.apiToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  return (
    <div className="max-w-xl space-y-6">
      <div><p className="eyebrow">{tr("การตั้งค่า")}</p><h1 className="page-title">{tr("บัญชีของฉัน")}</h1><p className="page-subtitle">{tr("ข้อมูลและการตั้งค่าการเข้าสู่ระบบของคุณ")}</p></div>
      <ProfileForm
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUpdatedAt: user.avatarUpdatedAt,
          summary: `${[...new Set(user.memberships.map((m) => m.title ?? user.role.name))].join(", ") || user.role.name} · ${tr(teamsLabel(user.memberships))}`,
        }}
      />
      <Link href="/teams" className="card flex items-center justify-between gap-3 transition hover:border-indigo-200">
        <div>
          <h2 className="font-semibold text-slate-900">{tr("ทีมของฉัน")}</h2>
          <p className="text-sm text-slate-500">{tr("ดูทีมที่อยู่ รับคำเชิญ สร้างทีม และเชิญคนเข้าทีม")}</p>
        </div>
        <span className="shrink-0 text-indigo-600" aria-hidden="true">→</span>
      </Link>
      {canAdmin(user.role.level) && (
        <Link href="/admin" className="card flex items-center justify-between gap-3 transition hover:border-indigo-200 lg:hidden">
          <div>
            <h2 className="font-semibold text-slate-900">{tr("จัดการระบบ")}</h2>
            <p className="text-sm text-slate-500">{tr("ผู้ใช้ role และทีมทั้งระบบ (สำหรับผู้ดูแล)")}</p>
          </div>
          <span className="shrink-0 text-indigo-600" aria-hidden="true">→</span>
        </Link>
      )}
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{tr("ภาษา")} <span className="font-normal text-slate-400">/ Language</span></h2>
          <p className="text-sm text-slate-500">{tr("ภาษาที่ใช้แสดงเมนูและข้อความในแอปบนอุปกรณ์เครื่องนี้")}</p>
        </div>
        <LanguageSwitch />
      </section>
      <NotificationSettings publicKey={pushPublicKey()} />
      <EmailSettings email={user.email} verified={Boolean(user.emailVerifiedAt)} enabled={user.emailNotifications} canSend={isEmailConfigured()} />
      <AiConnect
        endpoint={appUrl("/api/mcp")}
        tokens={tokens.map((t) => ({ id: t.id, name: t.name, readOnly: t.readOnly, created: formatDateTime(t.createdAt), lastUsed: t.lastUsedAt ? formatDateTime(t.lastUsedAt) : null }))}
      />
      <PasswordForm />
      <form action={logout} className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">{tr("ออกจากระบบ")}</h2>
          <p className="text-sm text-slate-500">{tr("ออกจากบัญชีนี้บนอุปกรณ์เครื่องนี้")}</p>
        </div>
        <button className="btn-ghost shrink-0 border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50">{tr("ออกจากระบบ")}</button>
      </form>
    </div>
  );
}
