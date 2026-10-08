import "server-only";
import { prisma } from "./db";
import { appUrl, sendEmail } from "./email";
import { sendPush } from "./push";

export type Notice = { title: string; body: string; url: string };

/**
 * แจ้งเตือนผู้ใช้ 3 ช่องทาง: กระดิ่งในแอป (เสมอ) · push (เครื่องที่เปิดไว้) · อีเมล (ถ้ายืนยันอีเมลแล้วและไม่ได้ปิดไว้)
 * push/อีเมลที่ล้มเหลวไม่ทำให้งานหลักพัง — recipients ซ้ำกันได้ ระบบส่งคนละครั้ง
 */
export async function notify(recipients: { userId: string; url?: string }[], notice: Notice) {
  const urlOf = new Map(recipients.map((r) => [r.userId, r.url ?? notice.url]));
  if (urlOf.size === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: [...urlOf.keys()] }, active: true },
      select: { id: true, email: true, emailVerifiedAt: true, emailNotifications: true, pushSubs: true },
    });
    if (users.length === 0) return;
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, title: notice.title, body: notice.body, url: urlOf.get(u.id)! })),
    });
    await Promise.all(
      users.flatMap((u) => {
        const url = urlOf.get(u.id)!;
        return [
          sendPush(u.pushSubs, { ...notice, url }).catch(() => undefined),
          u.emailVerifiedAt && u.emailNotifications
            ? sendEmail({ to: u.email, subject: notice.title, heading: notice.title, body: notice.body, action: { label: "เปิดใน Pace", url: appUrl(url) } })
            : undefined,
        ];
      }),
    );
  } catch (e) {
    console.error(e);
  }
}
