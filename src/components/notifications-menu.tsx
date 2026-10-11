"use client";

import Link from "next/link";
import * as P from "@radix-ui/react-popover";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { NavGlyph } from "./nav-icons";
import { useT } from "@/components/i18n";

export type NotificationPreview = { id: string; title: string; body: string; time: string; unread: boolean };

/** กระดิ่งในเมนูด้านข้าง (จอใหญ่): เปิดรายการล่าสุดได้โดยไม่ต้องออกจากหน้าที่ทำอยู่ — มือถือใช้หน้าแจ้งเตือนเต็มจอ */
export function NotificationsMenu({ items, unread }: { items: NotificationPreview[]; unread: number }) {
  const tr = useT();
  return (
    <P.Root>
      <P.Trigger className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 data-[state=open]:bg-indigo-50 data-[state=open]:font-semibold data-[state=open]:text-indigo-700">
        <NavGlyph icon="notifications" className="h-[1.15rem] w-[1.15rem]" />
        {tr("แจ้งเตือน")}
        {unread > 0 && <span className="ml-auto rounded-full bg-danger px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">{unread > 99 ? "99+" : unread}</span>}
      </P.Trigger>
      <P.Portal>
        <P.Content side="right" align="end" sideOffset={12} collisionPadding={16} className="tooltip-pop z-[80] w-[22rem] overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{tr("แจ้งเตือน")}{unread > 0 && <span className="ml-1.5 font-normal text-muted-foreground">{tr("ยังไม่อ่าน")}{" "}{unread}</span>}</p>
            {unread > 0 && (
              <form action={markAllNotificationsRead}>
                <button className="text-xs font-medium text-primary hover:text-primary-strong">{tr("อ่านทั้งหมด")}</button>
              </form>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tr("ยังไม่มีแจ้งเตือน")}</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id} className="border-b border-border last:border-b-0">
                  {/* ผ่าน route เพื่อทำเครื่องหมายว่าอ่านแล้วก่อนพาไปหน้าปลายทาง */}
                  <a href={`/api/notifications/${n.id}`} className={`flex gap-2.5 px-4 py-3 transition hover:bg-surface-sunken ${n.unread ? "bg-primary-soft/50" : ""}`}>
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.unread ? "bg-primary" : "bg-transparent"}`} aria-label={n.unread ? tr("ยังไม่ได้อ่าน") : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm leading-snug ${n.unread ? "font-semibold text-foreground" : "text-foreground"}`}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>
                      <span className="mt-1 block text-2xs text-subtle">{n.time}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <Link href="/notifications" className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-surface-sunken">{tr("ดูทั้งหมด")}</Link>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
