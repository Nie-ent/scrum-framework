import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { LEVEL } from "@/lib/permissions";
import { tr } from "@/lib/i18n/server";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireUser(LEVEL.ADMIN);
  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200 pb-5">
        <p className="eyebrow">Workspace settings</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="page-title">{tr("จัดการระบบ")}</h1><p className="page-subtitle">{tr("ตั้งค่าผู้ใช้ บทบาท และโครงสร้างทีม")}</p></div>
        <nav aria-label={tr("เมนูจัดการระบบ")} className="flex rounded-2xl bg-slate-100 p-1">
          <NavLink href="/admin/users">{tr("ผู้ใช้")}</NavLink>
          <NavLink href="/admin/roles">Roles & Levels</NavLink>
          <NavLink href="/admin/teams">{tr("ทีม")}</NavLink>
          <NavLink href="/admin/billing">{tr("ชำระเงิน")}</NavLink>
        </nav>
        </div>
      </div>
      {children}
    </div>
  );
}
