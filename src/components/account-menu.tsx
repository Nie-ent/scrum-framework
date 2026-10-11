"use client";

import Link from "next/link";
import { useState } from "react";
import * as P from "@radix-ui/react-popover";
import { logout } from "@/app/actions/auth";
import { NavGlyph } from "./nav-icons";
import { useT } from "@/components/i18n";

const item = "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition hover:bg-surface-sunken";

/** เมนูบัญชีที่รูปโปรไฟล์: ตั้งค่าบัญชี · จัดการระบบ (ผู้ดูแล) · ออกจากระบบ */
export function AccountMenu({ name, email, admin, children }: { name: string; email: string; admin: boolean; children: React.ReactNode }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        aria-label={tr("เมนูบัญชีของ {0}", [name])}
        className="flex min-w-0 items-center gap-2.5 rounded-full text-left leading-tight transition hover:bg-surface-sunken data-[state=open]:bg-surface-sunken lg:w-full lg:rounded-2xl lg:bg-surface-sunken lg:p-3"
      >
        {children}
        <span className="hidden min-w-0 flex-1 lg:block">
          <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{email}</span>
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="hidden size-4 shrink-0 text-subtle lg:block" aria-hidden="true">
          <path fillRule="evenodd" d="M10.53 3.47a.75.75 0 0 0-1.06 0L6.22 6.72a.75.75 0 0 0 1.06 1.06L10 5.06l2.72 2.72a.75.75 0 1 0 1.06-1.06l-3.25-3.25Zm-4.31 9.81 3.25 3.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 1 0-1.06-1.06L10 14.94l-2.72-2.72a.75.75 0 0 0-1.06 1.06Z" clipRule="evenodd" />
        </svg>
      </P.Trigger>
      <P.Portal>
        <P.Content side="top" align="end" sideOffset={8} collisionPadding={12} className="tooltip-pop z-[80] w-64 rounded-2xl border border-border bg-surface p-1.5 shadow-overlay">
          <div className="border-b border-border px-2.5 pb-2.5 pt-2">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </div>
          <div className="pt-1.5">
            <Link href="/account" onClick={close} className={item}>
              <NavGlyph icon="account" className="h-[1.15rem] w-[1.15rem] text-muted-foreground" />
              {tr("บัญชีและการตั้งค่า")}
            </Link>
            <Link href="/standup/history" onClick={close} className={item}>
              <NavGlyph icon="calendar" className="h-[1.15rem] w-[1.15rem] text-muted-foreground" />
              {tr("ประวัติเช็กอิน")}
            </Link>
            <Link href="/files" onClick={close} className={item}>
              <NavGlyph icon="files" className="h-[1.15rem] w-[1.15rem] text-muted-foreground" />
              {tr("ไฟล์สำคัญ")}
            </Link>
            {admin && (
              <Link href="/admin" onClick={close} className={item}>
                <NavGlyph icon="admin" className="h-[1.15rem] w-[1.15rem] text-muted-foreground" />
                {tr("จัดการระบบ")}
              </Link>
            )}
            <form action={logout} className="mt-1.5 border-t border-border pt-1.5">
              <button className={`${item} text-danger`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} className="h-[1.15rem] w-[1.15rem]" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                </svg>
                {tr("ออกจากระบบ")}
              </button>
            </form>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
