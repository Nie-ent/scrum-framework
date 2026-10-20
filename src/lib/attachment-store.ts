import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { isFileStorageConfigured, removeStoredFiles } from "./file-store";

/** ไฟล์แนบอยู่ได้กี่วันก่อนถูกลบ ถ้าไม่ถูก mark ว่าสำคัญ */
export const attachmentTtlDays = () => {
  const days = Number(process.env.ATTACHMENT_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : 7;
};

export const newExpiry = () => new Date(Date.now() + attachmentTtlDays() * 24 * 60 * 60 * 1000);

/** id ของรูปที่เนื้อหาโน้ตอ้างถึง (![](/api/files/<id>…)) */
export const noteImageIds = (content: string) => new Set([...content.matchAll(/\/api\/files\/([a-z0-9]+)/gi)].map((m) => m[1]));

/**
 * รูปที่อัปโหลดเข้าโน้ตแต่ไม่อยู่ในเนื้อหาแล้ว (เอาออก หรืออัปโหลดแล้วไม่ได้บันทึก) — เก็บไว้ 1 วันเผื่อกดเลิกทำ แล้วค่อยลบ
 */
export async function purgeUnusedNoteImages(before: Date): Promise<number> {
  const rows = await prisma.attachment.findMany({
    where: { noteId: { not: null }, createdAt: { lt: before }, note: { deletedAt: null } },
    select: { id: true, note: { select: { content: true } } },
    take: 500,
  });
  const unused = rows.filter((r) => r.note && !noteImageIds(r.note.content).has(r.id)).map((r) => r.id);
  return unused.length ? purgeAttachments({ id: { in: unused } }) : 0;
}

/** ลบไฟล์ใน Storage ก่อน แล้วค่อยลบแถว — ถ้า Storage ล้ม แถวยังอยู่ให้ cron ลองใหม่ */
export async function purgeAttachments(where: Prisma.AttachmentWhereInput): Promise<number> {
  const rows = await prisma.attachment.findMany({ where, select: { id: true, path: true }, take: 500 });
  if (rows.length === 0) return 0;
  if (isFileStorageConfigured()) await removeStoredFiles(rows.map((r) => r.path));
  await prisma.attachment.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  return rows.length;
}
