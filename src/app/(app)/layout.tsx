import Image from "next/image";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { NavGlyph, type NavIcon } from "@/components/nav-icons";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAdmin, canViewOverview } from "@/lib/permissions";
import { Avatar } from "@/components/avatar";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const level = user.role.level;
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  // mobile: false = ไม่อยู่ในแถบเมนูล่าง (ที่จำกัด): ไฟล์เข้าจากหน้า งาน, สถิติเข้าจากหน้า Daily Scrum, แจ้งเตือนอยู่ที่กระดิ่งบนแถบหัว
  const nav: { href: string; label: string; short: string; icon: NavIcon; show: boolean; mobile?: boolean; badge?: number }[] = [
    { href: "/standup", label: "Daily Scrum", short: "เช็กอิน", icon: "checkin", show: true },
    { href: "/tasks", label: "งาน", short: "งาน", icon: "tasks", show: true },
    { href: "/files", label: "ไฟล์สำคัญ", short: "ไฟล์", icon: "files", show: true, mobile: false },
    { href: "/dashboard", label: "ภาพรวมทีม", short: "ภาพรวม", icon: "overview", show: canViewOverview(user) },
    { href: "/stats", label: "สถิติ", short: "สถิติ", icon: "stats", show: true, mobile: false },
    { href: "/teams", label: "ทีม", short: "ทีม", icon: "teams", show: true },
    { href: "/admin", label: "Admin", short: "จัดการ", icon: "admin", show: canAdmin(level) },
    { href: "/notifications", label: "แจ้งเตือน", short: "แจ้งเตือน", icon: "notifications", show: true, mobile: false, badge: unread },
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
              <NavLink key={item.href} href={item.href} icon={item.icon}>
                {item.label}
                {Boolean(item.badge) && <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">{item.badge! > 99 ? "99+" : item.badge}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-1 lg:mt-auto lg:block">
          {/* มือถือ: กระดิ่งอยู่บนแถบหัว (จอใหญ่อยู่ในเมนูด้านข้าง) */}
          <Link href="/notifications" aria-label={unread > 0 ? `แจ้งเตือน ยังไม่ได้อ่าน ${unread} รายการ` : "แจ้งเตือน"} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 lg:hidden">
            <NavGlyph icon="notifications" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
          </Link>
          {/* ชื่อผู้ใช้พาไปหน้าบัญชี — ปุ่มออกจากระบบอยู่ในหน้านั้น */}
          <Link
            href="/account"
            className="flex min-w-0 items-center gap-2.5 rounded-xl leading-tight transition hover:bg-slate-100 lg:rounded-2xl lg:bg-slate-50 lg:p-3"
          >
            <Avatar user={user} size={32} />
            <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-800">{user.name}</div>
            <div className="mt-0.5 hidden text-xs text-slate-500 sm:block">
              {user.role.name}
            </div>
            </div>
          </Link>
          </div>
        </div>
      </header>
      {/* เว้นที่ด้านล่างให้แถบเมนูมือถือ (รวม safe area ของ iPhone) */}
      <main className="min-w-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl">{children}</div></main>
      <BottomNav items={items.filter((item) => item.mobile !== false).map(({ href, short, icon }) => ({ href, label: short, icon }))} />
    </div>
  );
}
