import "server-only";
import webpush from "web-push";
import { prisma } from "./db";

export type PushPayload = { title: string; body: string; url: string };

/** ตั้งค่าแล้วหรือยัง — ถ้าไม่มี VAPID key ฟีเจอร์แจ้งเตือนจะถูกปิด */
export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY ?? null;
export const isPushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://pace-scrum.vercel.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  configured = true;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

/** ส่งไปทุกเครื่องที่ให้มา — เครื่องที่ยกเลิก/หมดอายุแล้ว (404/410) จะถูกลบออกจาก DB */
export async function sendPush(subs: Sub[], payload: PushPayload) {
  if (!isPushConfigured() || subs.length === 0) return { sent: 0, removed: 0, failed: 0 };
  configure();

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 60 * 60 * 6 },
      ),
    ),
  );

  const expired: string[] = [];
  let sent = 0;
  let failed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent++;
    else if ([404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0)) expired.push(subs[i].id);
    else failed++;
  });
  if (expired.length > 0) await prisma.pushSubscription.deleteMany({ where: { id: { in: expired } } });
  return { sent, removed: expired.length, failed };
}
