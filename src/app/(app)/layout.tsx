import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { canAdmin, canViewOverview, teamsLabel } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const level = user.role.level;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <header className="border-b border-slate-200/80 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/" className="flex items-center gap-2.5 px-2 text-xl font-bold tracking-tight text-slate-950">
            <Image src="/logo.png" alt="" width={32} height={32} />
            Pace
          </Link>
          <p className="mt-1 hidden px-2 text-xs text-slate-400 lg:block">Daily teamwork, in rhythm</p>
          <nav aria-label="เมนูหลัก" className="mt-4 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            <NavLink href="/standup">Daily Scrum</NavLink>
            {canViewOverview(user) && <NavLink href="/dashboard">ภาพรวมทีม</NavLink>}
            {canAdmin(level) && <NavLink href="/admin">Admin</NavLink>}
            <NavLink href="/account">บัญชี</NavLink>
          </nav>
          <form action={logout} className="mt-3 lg:hidden">
            <button className="px-3 text-xs font-medium text-slate-500 hover:text-rose-600">ออกจากระบบ</button>
          </form>
          <div className="mt-auto hidden rounded-2xl bg-slate-50 p-3 lg:block">
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {user.role.name} · Lv {level}
                {user.memberships.length > 0 && ` · ${teamsLabel(user.memberships)}`}
              </div>
            </div>
            <form action={logout} className="mt-3">
              <button className="w-full text-left text-xs font-medium text-slate-500 transition hover:text-rose-600">ออกจากระบบ</button>
            </form>
          </div>
        </div>
      </header>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl">{children}</div></main>
    </div>
  );
}
