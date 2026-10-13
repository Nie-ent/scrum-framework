"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as P from "@radix-ui/react-popover";
import { useT } from "@/components/i18n";

const COOKIE = "pace_space";
/** หน้าที่แสดงข้อมูลของพื้นที่เดียว — เปลี่ยนพื้นที่แล้วอยู่หน้าเดิม */
const SPACE_PAGES = ["/standup", "/standup/history", "/tasks", "/calendar", "/files", "/stats"];

type Space = { id: string; name: string; parentId: string | null; personal: boolean };

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
const readCookie = () => {
  const found = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  return found ? decodeURIComponent(found.slice(COOKIE.length + 1)) : "";
};
const remember = (id: string) => {
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
};

const label = (s: Space) => (s.personal ? "พื้นที่ส่วนตัว" : s.name);

/** ตราย่อของพื้นที่: ตัวอักษรแรกของชื่อทีม หรือรูปคนสำหรับพื้นที่ส่วนตัว */
function Badge({ space }: { space: Space }) {
  return (
    <span aria-hidden="true" className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${space.personal ? "bg-surface-sunken text-muted-foreground" : "bg-primary-soft text-primary"}`}>
      {space.personal ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.5 20.12a7.5 7.5 0 0 1 15 0A17.93 17.93 0 0 1 12 21.75c-2.68 0-5.22-.58-7.5-1.63Z" />
        </svg>
      ) : (
        space.name.trim().charAt(0).toUpperCase()
      )}
    </span>
  );
}

/**
 * ตัวเลือกพื้นที่ (ทีม / พื้นที่ส่วนตัว) ที่เดียวของทั้งแอป — แทนแถบเลือกทีมที่เคยซ้ำอยู่ทุกหน้า
 * จำค่าไว้ใน cookie ให้ทุกหน้าใช้พื้นที่เดียวกัน
 */
export function SpaceSwitcher({ spaces, saved, className = "" }: { spaces: Space[]; saved?: string; className?: string }) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const param = useSearchParams().get("team");
  const [open, setOpen] = useState(false);
  // อ่าน cookie เองทุกครั้ง: layout ไม่ถูกวาดใหม่ตอนเปลี่ยนเมนู ค่า saved ที่ส่งมาจึงอาจเก่ากว่าที่หน้าใช้จริง
  const cookie = useSyncExternalStore(subscribe, readCookie, () => saved ?? "");
  const fromLink = spaces.find((s) => s.id === param)?.id;
  const currentId = fromLink ?? spaces.find((s) => s.id === cookie)?.id ?? spaces[0]?.id ?? "";
  const current = spaces.find((s) => s.id === currentId);

  // เปิดลิงก์ที่ระบุพื้นที่มา (เช่นจากแจ้งเตือน) = ถือว่าย้ายมาพื้นที่นั้นแล้ว
  useEffect(() => {
    if (fromLink && fromLink !== cookie) remember(fromLink);
  }, [fromLink, cookie]);

  if (!current) return null;
  const hasParent = (s: Space) => s.parentId !== null && spaces.some((p) => p.id === s.parentId);
  const teams = spaces.filter((s) => !s.personal);
  const personal = spaces.filter((s) => s.personal);

  const choose = (id: string) => {
    setOpen(false);
    if (id === currentId) return;
    remember(id);
    const base = pathname.startsWith("/notes") ? "/notes" : pathname.startsWith("/dashboard") ? "/dashboard" : SPACE_PAGES.find((p) => pathname === p);
    if (base) router.push(`${base}?team=${id}`);
    else router.refresh();
  };

  const option = (s: Space) => (
    <li key={s.id}>
      <button
        type="button"
        role="option"
        aria-selected={s.id === currentId}
        onClick={() => choose(s.id)}
        className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-sm transition hover:bg-surface-sunken ${hasParent(s) ? "pl-6" : ""} ${s.id === currentId ? "font-semibold text-foreground" : "text-foreground"}`}
      >
        <Badge space={s} />
        <span className="min-w-0 flex-1 truncate">{tr(label(s))}</span>
        {s.id === currentId && (
          <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-primary" aria-hidden="true">
            <path fillRule="evenodd" d="M16.7 4.15a.75.75 0 0 1 .15 1.05l-8 10.5a.75.75 0 0 1-1.13.08l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.9 3.89 7.47-9.81a.75.75 0 0 1 1.05-.15Z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </li>
  );

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        data-tour="space"
        aria-label={tr("พื้นที่ที่กำลังใช้: {0} — กดเพื่อเปลี่ยน", [tr(label(current))])}
        className={`flex items-center gap-2.5 rounded-xl border border-border bg-surface px-2 py-1.5 text-left shadow-soft transition hover:bg-surface-sunken data-[state=open]:border-border-strong data-[state=open]:bg-surface-sunken ${className}`}
      >
        <Badge space={current} />
        <span className="min-w-0 flex-1">
          <span className="hidden text-2xs leading-none text-subtle lg:block">{tr("พื้นที่")}</span>
          <span className="block truncate text-sm font-semibold leading-snug text-foreground">{tr(label(current))}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-4 shrink-0 text-subtle" aria-hidden="true">
          <path fillRule="evenodd" d="M10.53 3.47a.75.75 0 0 0-1.06 0L6.22 6.72a.75.75 0 0 0 1.06 1.06L10 5.06l2.72 2.72a.75.75 0 1 0 1.06-1.06l-3.25-3.25Zm-4.31 9.81 3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06L10 14.94l-2.72-2.72a.75.75 0 0 0-1.06 1.06Z" clipRule="evenodd" />
        </svg>
      </P.Trigger>
      <P.Portal>
        <P.Content align="start" sideOffset={6} collisionPadding={12} className="tooltip-pop z-[80] w-[min(18rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-1.5 shadow-overlay">
          <div role="listbox" aria-label={tr("เลือกพื้นที่")} className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {teams.length > 0 && (
              <>
                <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{tr("ทีม")}</p>
                <ul>{teams.map(option)}</ul>
              </>
            )}
            {personal.length > 0 && <ul className={teams.length > 0 ? "mt-1.5 border-t border-border pt-1.5" : ""}>{personal.map(option)}</ul>}
          </div>
          <Link href="/teams" onClick={() => setOpen(false)} className="mt-1.5 flex min-h-10 items-center gap-2 border-t border-border px-2 pt-1.5 text-sm font-medium text-primary hover:text-primary-strong">
            {tr("จัดการทีมและคำเชิญ")}
          </Link>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
