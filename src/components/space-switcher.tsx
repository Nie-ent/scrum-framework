"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const COOKIE = "pace_space";
/** หน้าที่แสดงข้อมูลของพื้นที่เดียว — เปลี่ยนพื้นที่แล้วอยู่หน้าเดิม */
const SPACE_PAGES = ["/standup", "/tasks", "/calendar", "/files", "/stats"];

type Space = { id: string; name: string; parentId: string | null; personal: boolean };

const remember = (id: string) => {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
};

/**
 * ตัวเลือกพื้นที่ (ทีม / พื้นที่ส่วนตัว) ที่เดียวของทั้งแอป — แทนแถบเลือกทีมที่เคยซ้ำอยู่ทุกหน้า
 * จำค่าไว้ใน cookie ให้ทุกหน้าใช้พื้นที่เดียวกัน
 */
export function SpaceSwitcher({ spaces, saved, className = "" }: { spaces: Space[]; saved?: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get("team");
  const fromLink = spaces.find((s) => s.id === param)?.id;
  const current = fromLink ?? spaces.find((s) => s.id === saved)?.id ?? spaces[0]?.id ?? "";

  // เปิดลิงก์ที่ระบุพื้นที่มา (เช่นจากแจ้งเตือน) = ถือว่าย้ายมาพื้นที่นั้นแล้ว
  useEffect(() => {
    if (fromLink && fromLink !== saved) remember(fromLink);
  }, [fromLink, saved]);

  if (spaces.length === 0) return null;
  const hasParent = (s: Space) => s.parentId !== null && spaces.some((p) => p.id === s.parentId);

  return (
    <label className={`relative block ${className}`}>
      <span className="sr-only">พื้นที่ที่กำลังใช้</span>
      <select
        value={current}
        onChange={(e) => {
          const id = e.target.value;
          remember(id);
          const base = pathname.startsWith("/notes") ? "/notes" : pathname.startsWith("/dashboard") ? "/dashboard" : SPACE_PAGES.find((p) => pathname === p);
          if (base) router.push(`${base}?team=${id}`);
          else router.refresh();
        }}
        className="w-full appearance-none truncate rounded-xl border border-border-strong bg-surface py-2 pl-3 pr-8 text-sm font-semibold text-foreground shadow-soft transition hover:bg-surface-sunken"
      >
        {spaces.filter((s) => !s.personal).length > 0 && (
          <optgroup label="ทีม">
            {spaces.filter((s) => !s.personal).map((s) => (
              <option key={s.id} value={s.id}>{hasParent(s) ? "  └ " : ""}{s.name}</option>
            ))}
          </optgroup>
        )}
        {spaces.filter((s) => s.personal).map((s) => (
          <option key={s.id} value={s.id}>พื้นที่ส่วนตัว</option>
        ))}
      </select>
      <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true">
        <path fillRule="evenodd" d="M10.53 3.47a.75.75 0 0 0-1.06 0L6.22 6.72a.75.75 0 0 0 1.06 1.06L10 5.06l2.72 2.72a.75.75 0 1 0 1.06-1.06l-3.25-3.25Zm-4.31 9.81 3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06L10 14.94l-2.72-2.72a.75.75 0 0 0-1.06 1.06Z" clipRule="evenodd" />
      </svg>
    </label>
  );
}
