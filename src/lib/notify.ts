import "server-only";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";
import { sendPush } from "./push";
import type { Translate } from "./i18n/core";
import { trFor } from "./i18n/server";

export type Notice = { title: string; body: string; url: string };
/** ข้อความแจ้งเตือน — ถ้าเป็นฟังก์ชัน จะถูกสร้างแยกตามภาษาของผู้รับแต่ละคน */
export type NoticeSource = Notice | ((tr: Translate) => Notice);

/**
 * แจ้งเตือนผู้ใช้ 3 ช่องทาง: กระดิ่งในแอป (เสมอ) · push (เครื่องที่เปิดไว้) · อีเมล (ถ้ายืนยันอีเมลแล้วและไม่ได้ปิดไว้)
 * options.email = false สำหรับเหตุการณ์ที่เกิดถี่ (เช่น อัปเดต % งาน) เพื่อไม่ให้อีเมลล้น
 * push/อีเมลที่ล้มเหลวไม่ทำให้งานหลักพัง — recipients ซ้ำกันได้ ระบบส่งคนละครั้ง
 */
export async function notify(recipients: { userId: string; url?: string }[], source: NoticeSource, options: { email?: boolean } = {}) {
  const build = (lang: unknown) => (typeof source === "function" ? source(trFor(lang)) : source);
  const urlOf = new Map(recipients.map((r) => [r.userId, r.url]));
  if (urlOf.size === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [...urlOf.keys()] }, active: true },
      select: { id: true, email: true, emailVerifiedAt: true, emailNotifications: true, pushSubs: true, locale: true },
    });
    if (users.length === 0) return;
    const each = users.map((u) => {
      const notice = build(u.locale);
      return { user: u, notice, url: urlOf.get(u.id) ?? notice.url };
    });
    await prisma.notification.createMany({
      data: each.map(({ user, notice, url }) => ({ userId: user.id, title: notice.title, body: notice.body, url })),
    });
    await Promise.all(
      each.flatMap(({ user: u, notice, url }) => {
        return [
          sendPush(u.pushSubs, { ...notice, url }).catch(() => undefined),
          options.email !== false && u.emailVerifiedAt && u.emailNotifications
            ? sendEmail({ to: u.email, subject: notice.title, heading: notice.title, body: notice.body, action: { label: trFor(u.locale)("เปิดใน Pace"), url: appUrl(url) }, lang: u.locale })
            : undefined,
        ];
      }),
    );
  } catch (e) {
    console.error(e);
  }
}
