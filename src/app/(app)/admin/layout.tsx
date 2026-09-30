import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { LEVEL } from "@/lib/permissions";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireUser(LEVEL.ADMIN);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="flex gap-1">
          <NavLink href="/admin/users">ผู้ใช้</NavLink>
          <NavLink href="/admin/roles">Roles & Levels</NavLink>
          <NavLink href="/admin/teams">ทีม</NavLink>
        </nav>
      </div>
      {children}
    </div>
  );
}
