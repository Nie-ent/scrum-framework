"use server";

import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isPushConfigured, sendPush } from "@/lib/push";

const SubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
});

type Result = { ok: true; message?: string } | { ok: false; error: string };

/** บันทึกเครื่องนี้ให้รับแจ้งเตือน (เครื่องเดิมที่เคยเป็นของคนอื่นจะย้ายมาเป็นของคนที่ login อยู่) */
export async function subscribePush(subscription: unknown): Promise<Result> {
  const user = await requireUser();
  if (!isPushConfigured()) return { ok: false, error: "ระบบยังไม่ได้ตั้งค่าการแจ้งเตือน" };
  const parsed = SubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "ข้อมูลการแจ้งเตือนไม่ถูกต้อง" };

  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, ...keys },
    update: { userId: user.id, ...keys },
  });
  return { ok: true };
}

export async function unsubscribePush(endpoint: string): Promise<Result> {
  const user = await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint: String(endpoint) } });
  return { ok: true };
}

/** ส่งแจ้งเตือนทดสอบไปทุกเครื่องของตัวเอง */
export async function sendTestPush(): Promise<Result> {
  const user = await requireUser();
  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
  if (subs.length === 0) return { ok: false, error: "ยังไม่มีเครื่องที่เปิดการแจ้งเตือน" };
  const result = await sendPush(subs, {
    title: "Pace — ทดสอบการแจ้งเตือน",
    body: "ถ้าเห็นข้อความนี้ แปลว่าการแจ้งเตือนใช้งานได้ 🎉",
    url: "/standup",
  });
  if (result.sent === 0) return { ok: false, error: "ส่งไม่สำเร็จ ลองปิดแล้วเปิดการแจ้งเตือนใหม่" };
  return { ok: true, message: `ส่งแล้ว ${result.sent} เครื่อง` };
}
