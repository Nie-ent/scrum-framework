import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { BottomNav, type NavIcon } from "@/components/bottom-nav";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { canAdmin, canViewOverview, teamsLabel } from "@/lib/permissions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const level = user.role.level;
  const nav: { href: string; label: string; short: string; icon: NavIcon; show: boolean }[] = [
    { href: "/standup", label: "Daily Scrum", short: "เช็กอิน", icon: "checkin", show: true },
    { href: "/dashboard", label: "ภาพรวมทีม", short: "ภาพรวม", icon: "overview", show: canViewOverview(user) },
    { href: "/admin", label: "Admin", short: "จัดการ", icon: "admin", show: canAdmin(level) },
    { href: "/account", label: "บัญชี", short: "บัญชี", icon: "account", show: true },
  ];
  const items = nav.filter((item) => item.show);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
      <header className="border-b border-slate-200/80 bg-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-full items-center justify-between gap-3 px-4 py-3 lg:flex-col lg:items-stretch lg:justify-start lg:px-5 lg:py-6">
          <div>
            <Link href="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-slate-950 lg:px-2 lg:text-xl">
              <Image src="/logo.png" alt="" width={32} height={32} className="h-7 w-7 lg:h-8 lg:w-8" />
              Pace
            </Link>
            <p className="mt-1 hidden px-2 text-xs text-slate-400 lg:block">Daily teamwork, in rhythm</p>
          </div>
          {/* จอใหญ่: เมนูใน sidebar — มือถือใช้ BottomNav ด้านล่างแทน */}
          <nav aria-label="เมนูหลัก" className="mt-4 hidden flex-col gap-1 lg:flex">
            {items.map((item) => (
              <NavLink key={item.href} href={item.href}>{item.label}</NavLink>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-3 lg:mt-auto lg:block lg:rounded-2xl lg:bg-slate-50 lg:p-3">
            <div className="min-w-0 text-right leading-tight lg:text-left">
              <div className="truncate text-sm font-semibold text-slate-800">{user.name}</div>
              <div className="mt-0.5 hidden text-xs text-slate-500 sm:block">
                {user.role.name} · Lv {level}
                {user.memberships.length > 0 && ` · ${teamsLabel(user.memberships)}`}
              </div>
            </div>
            <form action={logout} className="shrink-0 lg:mt-3">
              <button className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:text-rose-600 lg:w-full lg:px-0 lg:py-0 lg:text-left">ออกจากระบบ</button>
            </form>
          </div>
        </div>
      </header>
      {/* เว้นที่ด้านล่างให้แถบเมนูมือถือ (รวม safe area ของ iPhone) */}
      <main className="min-w-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl">{children}</div></main>
      <BottomNav items={items.map(({ href, short, icon }) => ({ href, label: short, icon }))} />
    </div>
  );
}
