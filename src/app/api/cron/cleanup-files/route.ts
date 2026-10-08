import { purgeAttachments } from "@/lib/attachment-store";
import { isFileStorageConfigured } from "@/lib/file-store";

export const dynamic = "force-dynamic";

/**
 * ลบไฟล์แนบชั่วคราวที่หมดอายุ — เรียกโดย Vercel Cron (ดู vercel.json)
 * หรือ cron ภายนอกพร้อม header `Authorization: Bearer $CRON_SECRET`
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isFileStorageConfigured()) return Response.json({ error: "file storage not configured" }, { status: 503 });

  const now = new Date();
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
  return Response.json({ ok: true, removed });
}
