"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/components/i18n";

/**
 * แท็บย่อยของหมวดเมนูบนจอเล็ก (จอใหญ่เห็นรายการย่อยในเมนูด้านข้างอยู่แล้ว)
 * งาน = รายการ · ปฏิทิน   |   ภาพรวม = ภาพรวมทีม · สถิติ · ทีมและคำเชิญ
 */
export function SectionTabs({ canOverview }: { canOverview: boolean }) {
  const tr = useT();
  const pathname = usePathname();
  const team = useSearchParams().get("team");
  const groups = [
    [
      { href: "/tasks", label: tr("รายการงาน") },
      { href: "/calendar", label: tr("ปฏิทิน") },
    ],
    [
      ...(canOverview ? [{ href: "/dashboard", label: tr("ภาพรวมทีม") }] : []),
      { href: "/stats", label: tr("สถิติ") },
      { href: "/teams", label: tr("ทีมและคำเชิญ") },
    ],
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const group = groups.find((g) => g.some((t) => isActive(t.href)));
  if (!group) return null;
  return (
    <nav aria-label={tr("หมวดย่อย")} className="scrollbar-none -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6 lg:hidden">
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
