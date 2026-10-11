import Image from "next/image";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { NavGlyph, type NavIcon } from "@/components/nav-icons";
import { NavLink } from "@/components/nav-link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAdmin, canViewOverview } from "@/lib/permissions";
import { AccountMenu } from "@/components/account-menu";
import { Avatar } from "@/components/avatar";
import { NotificationsMenu } from "@/components/notifications-menu";
import { SectionTabs } from "@/components/section-tabs";
import { formatDateTime } from "@/lib/dates";
import { SpaceSwitcher } from "@/components/space-switcher";
import { Tooltip } from "@/components/tooltip";
import { currentSpaceId } from "@/lib/space";
import { getWorkspaceTeams } from "@/lib/teams";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const level = user.role.level;
  const [unread, latest] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 6 }),
  ]);
  const previews = latest.map((n) => ({ id: String(n.id), title: n.title, body: n.body, time: formatDateTime(n.createdAt), unread: !n.readAt }));
  const overview = canViewOverview(user);
  const [{ teams }, saved] = await Promise.all([getWorkspaceTeams(user), currentSpaceId()]);
  const spaces = teams.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId, personal: Boolean(t.personalOfId) }));

  // เมนูจัดเป็นหมวด: สิ่งที่ทำทุกวัน · งาน (รายการ/ปฏิทิน/ไฟล์ = มุมมองของงานชุดเดียวกัน) · โน้ต · ทีม (ทุกอย่างเกี่ยวกับคนอื่น)
  type Item = { href: string; label: string; icon: NavIcon; show?: boolean; badge?: number };
  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: "/standup", label: "วันนี้", icon: "checkin" }] },
    {
      title: "งาน",
      items: [
        { href: "/tasks", label: "รายการงาน", icon: "tasks" },
        { href: "/calendar", label: "ปฏิทิน", icon: "calendar" },
        { href: "/files", label: "ไฟล์สำคัญ", icon: "files" },
      ],
    },
    { title: "ความรู้", items: [{ href: "/notes", label: "โน้ต", icon: "notes" }] },
    {
      title: "ภาพรวม",
      items: [
        { href: "/dashboard", label: "ภาพรวมทีม", icon: "overview", show: overview },
        { href: "/stats", label: "สถิติ", icon: "stats" },
        { href: "/teams", label: "ทีมและคำเชิญ", icon: "teams" },
      ],
    },
    {
      items: [
        { href: "/notifications", label: "แจ้งเตือน", icon: "notifications", badge: unread },
        { href: "/admin", label: "จัดการระบบ", icon: "admin", show: canAdmin(level) },
      ],
    },
  ];
  // มือถือ: 4 ปลายทาง — หมวด งาน และ ภาพรวม มีแท็บย่อยที่หัวหน้า (SectionTabs) · บัญชีอยู่ที่รูปโปรไฟล์บนแถบหัว
  const bottom = [
    { href: "/standup", label: "วันนี้", icon: "checkin" as const },
    { href: "/tasks", label: "งาน", icon: "tasks" as const, match: ["/calendar", "/files"] },
    { href: "/notes", label: "โน้ต", icon: "notes" as const },
    { href: overview ? "/dashboard" : "/teams", label: "ภาพรวม", icon: "overview" as const, match: ["/dashboard", "/stats", "/teams"] },
  ];

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <header className="border-b border-border bg-surface lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-full items-center gap-2 px-4 py-2.5 lg:flex-col lg:items-stretch lg:gap-0 lg:px-4 lg:py-5">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-lg font-bold tracking-tight text-foreground lg:px-2 lg:text-xl" aria-label="Pace หน้าแรก">
            <Image src="/logo.png" alt="" width={32} height={32} className="h-7 w-7 lg:h-8 lg:w-8" />
            <span className="max-sm:sr-only">Pace</span>
          </Link>
          {/* พื้นที่ที่กำลังใช้ — เลือกที่นี่ที่เดียว ทุกหน้าใช้ตาม */}
          <SpaceSwitcher spaces={spaces} saved={saved} className="min-w-0 flex-1 lg:mt-4 lg:flex-none" />
          {/* จอใหญ่: เมนูใน sidebar — มือถือใช้ BottomNav ด้านล่างแทน */}
          <nav aria-label="เมนูหลัก" className="mt-4 hidden flex-col gap-4 lg:flex">
            {groups.map((group, i) => {
              const items = group.items.filter((item) => item.show !== false);
              if (items.length === 0) return null;
              return (
                <div key={group.title ?? i} className="flex flex-col gap-0.5">
                  {group.title && <p className="px-3 pb-1 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{group.title}</p>}
                  {items.map((item) =>
                    item.href === "/notifications" ? (
                      <NotificationsMenu key={item.href} items={previews} unread={unread} />
                    ) : (
                    <NavLink key={item.href} href={item.href} icon={item.icon}>
                      {item.label}
                      {Boolean(item.badge) && <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">{item.badge! > 99 ? "99+" : item.badge}</span>}
                    </NavLink>
                    ),
                  )}
                </div>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center gap-1 lg:mt-auto lg:block lg:pt-4">
          {/* มือถือ: กระดิ่งอยู่บนแถบหัว (จอใหญ่อยู่ในเมนูด้านข้าง) */}
          <Tooltip label="แจ้งเตือน" side="bottom">
          <Link href="/notifications" aria-label={unread > 0 ? `แจ้งเตือน ยังไม่ได้อ่าน ${unread} รายการ` : "แจ้งเตือน"} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-surface-sunken lg:hidden">
            <NavGlyph icon="notifications" />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" />}
          </Link>
          </Tooltip>
          {/* รูปโปรไฟล์ = เมนูบัญชี (ตั้งค่า · ออกจากระบบ) */}
          <AccountMenu name={user.name} email={user.email} admin={canAdmin(level)}>
            <Avatar user={user} size={32} />
          </AccountMenu>
          </div>
        </div>
      </header>
      {/* เว้นที่ด้านล่างให้แถบเมนูมือถือ (รวม safe area ของ iPhone) */}
      <main className="min-w-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl"><SectionTabs canOverview={overview} />{children}</div></main>
      <BottomNav items={bottom} />
    </div>
  );
}
