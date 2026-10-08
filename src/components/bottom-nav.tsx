"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavGlyph, type NavIcon } from "./nav-icons";

/** เมนูหลักบนมือถือ — ติดขอบล่างให้กดด้วยนิ้วโป้งได้ถึง (จอใหญ่ใช้ sidebar แทน) */
export function BottomNav({ items }: { items: { href: string; label: string; icon: NavIcon }[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="เมนูหลัก"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:bg-slate-100 ${
                  active ? "text-indigo-700" : "text-slate-500"
                }`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-indigo-50" : ""}`}>
                  <NavGlyph icon={item.icon} strokeWidth={active ? 2 : 1.6} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
