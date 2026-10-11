"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * แท็บย่อยของหมวดเมนูบนจอเล็ก (จอใหญ่เห็นรายการย่อยในเมนูด้านข้างอยู่แล้ว)
 * งาน = รายการ · ปฏิทิน · ไฟล์สำคัญ   |   ภาพรวม = ภาพรวมทีม · สถิติ · ทีมและคำเชิญ
 */
export function SectionTabs({ canOverview }: { canOverview: boolean }) {
  const pathname = usePathname();
  const team = useSearchParams().get("team");
  const groups = [
    [
      { href: "/tasks", label: "รายการงาน" },
      { href: "/calendar", label: "ปฏิทิน" },
      { href: "/files", label: "ไฟล์สำคัญ" },
    ],
    [
      ...(canOverview ? [{ href: "/dashboard", label: "ภาพรวมทีม" }] : []),
      { href: "/stats", label: "สถิติ" },
      { href: "/teams", label: "ทีมและคำเชิญ" },
    ],
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const group = groups.find((g) => g.some((t) => isActive(t.href)));
  if (!group) return null;
  return (
    <nav aria-label="หมวดย่อย" className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6 lg:hidden">
      {group.map((t) => (
        <Link
          key={t.href}
          href={team && t.href !== "/teams" ? `${t.href}?team=${team}` : t.href}
          aria-current={isActive(t.href) ? "page" : undefined}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition ${isActive(t.href) ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
