import type { Prisma } from "@prisma/client";

/** ขนาดไฟล์แนบสูงสุดต่อไฟล์ */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** แนบได้กี่ไฟล์ต่อครั้ง */
export const MAX_FILES_PER_UPLOAD = 5;

/** ใช้กับ include ของ Task / Comment — เฉพาะไฟล์ที่อัปโหลดเสร็จแล้ว (ไฟล์หมดอายุกรองตอนแสดงด้วย toFileItems) */
export const withAttachments = {
  where: { uploadedAt: { not: null } },
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    name: true,
    mimeType: true,
    size: true,
    uploaderId: true,
    expiresAt: true,
    importantAt: true,
  },
} satisfies Prisma.AttachmentFindManyArgs;

export type AttachmentRow = Prisma.AttachmentGetPayload<typeof withAttachments>;

/** ไฟล์แนบอยู่ใต้งาน หรือใต้ความคิดเห็น */
export type AttachmentTarget = { taskId: string } | { commentId: string };

/** ข้อมูลไฟล์ที่ส่งให้ฝั่ง client — daysLeft = null เมื่อถูก mark ว่าสำคัญ (ไม่หมดอายุ) */
export type FileItem = { id: string; name: string; size: number; isImage: boolean; important: boolean; daysLeft: number | null; mine: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;

/** ตัดไฟล์ที่หมดอายุแล้ว (รอ cron ลบ) และคำนวณวันที่เหลือ */
export function toFileItems(rows: AttachmentRow[], viewerId: string, now = new Date()): FileItem[] {
  return rows
    .filter((f) => f.importantAt || f.expiresAt > now)
    .map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      isImage: f.mimeType.startsWith("image/"),
      important: Boolean(f.importantAt),
      daysLeft: f.importantAt ? null : Math.max(1, Math.ceil((f.expiresAt.getTime() - now.getTime()) / DAY_MS)),
      mine: f.uploaderId === viewerId,
    }));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
