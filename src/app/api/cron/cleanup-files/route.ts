import { purgeAttachments } from "@/lib/attachment-store";
import { prisma } from "@/lib/db";
import { isFileStorageConfigured } from "@/lib/file-store";

export const dynamic = "force-dynamic";

/**
 * เก็บกวาดประจำวัน: ไฟล์แนบชั่วคราวที่หมดอายุ, ตัวนับ rate limit เก่า, แจ้งเตือนเก่า — เรียกโดย Vercel Cron (ดู vercel.json)
 * หรือ cron ภายนอกพร้อม header `Authorization: Bearer $CRON_SECRET`
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  // เก็บกวาดประจำวัน: ตัวนับ rate limit ที่หมดช่วงแล้ว และแจ้งเตือนที่อ่านแล้วเกิน 90 วัน
  const [limits, notices] = await Promise.all([
    prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } }),
    prisma.notification.deleteMany({ where: { readAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } } }),
  ]);
  if (!isFileStorageConfigured()) return Response.json({ ok: true, removed: 0, rateLimits: limits.count, notifications: notices.count });

  const removed = await purgeAttachments({
    OR: [
      // หมดอายุและไม่ได้ถูก mark ว่าสำคัญ
      { importantAt: null, expiresAt: { lt: now } },
      // งาน/ความคิดเห็นที่ไฟล์สังกัดถูกลบไปแล้ว
      { taskId: null, commentId: null },
      // ขอ URL แล้วแต่อัปโหลดไม่เสร็จเกิน 1 วัน
      { uploadedAt: null, createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    ],
  });
  return Response.json({ ok: true, removed, rateLimits: limits.count, notifications: notices.count });
}
