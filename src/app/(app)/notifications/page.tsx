import type { Metadata } from "next";
import { markAllNotificationsRead } from "@/app/actions/notifications";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { EmptyState } from "@/components/ui-state";

export const metadata: Metadata = { title: "แจ้งเตือน" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 60 });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="page-header">
        <div>
          <p className="eyebrow">Inbox</p>
          <h1 className="page-title">แจ้งเตือน</h1>
          <p className="page-subtitle">{unread > 0 ? `ยังไม่ได้อ่าน ${unread} รายการ` : "อ่านครบแล้ว"}</p>
        </div>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button className="btn-ghost">ทำเครื่องหมายว่าอ่านแล้วทั้งหมด</button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState title="ยังไม่มีแจ้งเตือน" description="เมื่อมีคนมอบหมายงาน แสดงความคิดเห็น หรือเชิญคุณเข้าทีม จะแสดงที่นี่" />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {items.map((n) => (
            <li key={String(n.id)} className="border-b border-slate-100 last:border-b-0">
              {/* ผ่าน route เพื่อทำเครื่องหมายว่าอ่านแล้วก่อนพาไปหน้าปลายทาง */}
              <a
                href={`/api/notifications/${n.id}`}
                className={`flex gap-3 px-4 py-3.5 transition hover:bg-slate-50 sm:px-5 ${n.readAt ? "" : "bg-indigo-50/40"}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-indigo-500"}`} aria-label={n.readAt ? undefined : "ยังไม่ได้อ่าน"} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.readAt ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-sm text-slate-500">{n.body}</span>
                </span>
                <time dateTime={n.createdAt.toISOString()} className="shrink-0 text-xs text-slate-400">{formatDateTime(n.createdAt)}</time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
