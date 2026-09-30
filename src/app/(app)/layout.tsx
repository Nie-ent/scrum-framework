import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { canAdmin, canViewTeamOverview } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const level = user.role.level;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-2 flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-sm text-white">S</span>
            Scrum
          </span>
          <nav className="flex flex-wrap gap-1">
            <NavLink href="/standup">Daily Scrum</NavLink>
            {canViewTeamOverview(level) && <NavLink href="/dashboard">ภาพรวมทีม</NavLink>}
            {canAdmin(level) && <NavLink href="/admin">Admin</NavLink>}
            <NavLink href="/account">บัญชี</NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-slate-500">
                {user.role.name} · Lv {level}
                {user.team && ` · ${user.team.name}`}
              </div>
            </div>
            <form action={logout}>
              <button className="btn-ghost">ออกจากระบบ</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
