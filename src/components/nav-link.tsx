"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavGlyph, type NavIcon } from "./nav-icons";

export function NavLink({ href, icon, children }: { href: string; icon?: NavIcon; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm transition ${
        active ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {icon && <NavGlyph icon={icon} strokeWidth={active ? 2 : 1.6} className="h-[1.15rem] w-[1.15rem]" />}
      {children}
    </Link>
  );
}
