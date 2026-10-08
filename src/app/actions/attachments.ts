"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { teamAccess } from "@/lib/access";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/attachments";
import { newExpiry, purgeAttachments } from "@/lib/attachment-store";
import { createUploadUrl, isFileStorageConfigured, storedSize } from "@/lib/file-store";

function done() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
  revalidatePath("/files");
  revalidatePath("/dashboard", "layout");
}

const UploadSchema = z.object({
  taskId: z.string().max(40).optional(),
  commentId: z.string().max(40).optional(),
  name: z.string().trim().min(1).max(200),
  mimeType: z.string().max(150),
  size: z.number().int().positive(),
});

/**
 * ขั้นที่ 1 ของการแนบไฟล์: ตรวจสิทธิ์ จองแถว แล้วคืน URL ให้เบราว์เซอร์อัปโหลดตรงไปที่ Storage
 * - แนบกับงาน: คนรับงาน คนมอบหมาย หรือคนที่ดูแลทีม
 * - แนบกับความคิดเห็น: คนเขียนความคิดเห็นนั้น
 */
export async function requestUpload(input: z.input<typeof UploadSchema>): Promise<{ error: string } | { id: string; uploadUrl: string }> {
  const user = await requireUser();
  if (!isFileStorageConfigured()) return { error: "ระบบยังไม่ได้ตั้งค่าที่เก็บไฟล์" };
  const parsed = UploadSchema.safeParse(input);
  if (!parsed.success) return { error: "ข้อมูลไฟล์ไม่ถูกต้อง" };
  const { taskId, commentId, name, mimeType, size } = parsed.data;
  if (size > MAX_FILE_BYTES) return { error: `ไฟล์ใหญ่เกิน ${formatBytes(MAX_FILE_BYTES)}` };

  let allowed = false;
  if (taskId && !commentId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (task && !task.deletedAt) {
      const access = await teamAccess(user, { teamId: task.teamId, ownerId: task.assigneeId });
      allowed = access.manage || (access.read && (task.assigneeId === user.id || task.createdById === user.id));
    }
  } else if (commentId && !taskId) {
    const comment = await prisma.comment.findUnique({ where: { id: commentId }, select: { authorId: true } });
    allowed = comment?.authorId === user.id;
  }
  if (!allowed) return { error: "คุณไม่มีสิทธิ์แนบไฟล์ที่นี่" };

  const row = await prisma.attachment.create({
    // path ใช้ id ล้วน ๆ — ชื่อไฟล์จริง (อาจเป็นภาษาไทย/มีอักขระพิเศษ) เก็บใน name
    data: { uploaderId: user.id, taskId, commentId, name, mimeType: mimeType || "application/octet-stream", size, path: crypto.randomUUID(), expiresAt: newExpiry() },
  });
  try {
    return { id: row.id, uploadUrl: await createUploadUrl(row.path) };
  } catch (e) {
    console.error(e);
    await prisma.attachment.delete({ where: { id: row.id } });
    return { error: "เตรียมการอัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

/** ขั้นที่ 2: เบราว์เซอร์อัปโหลดเสร็จแล้ว — ตรวจว่ามีไฟล์จริงและขนาดไม่เกิน แล้วจึงแสดง */
export async function confirmUpload(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const row = await prisma.attachment.findUnique({ where: { id: String(id) } });
  if (!row || row.uploaderId !== user.id || row.uploadedAt) return { ok: false };
  const size = await storedSize(row.path);
  if (size === null || size > MAX_FILE_BYTES) {
    await purgeAttachments({ id: row.id });
    return { ok: false };
  }
  await prisma.attachment.update({ where: { id: row.id }, data: { uploadedAt: new Date(), size, expiresAt: newExpiry() } });
  done();
  return { ok: true };
}

/** ไฟล์ + สิทธิ์ของ user ต่อไฟล์นั้น (ตามทีมของงาน/เช็กอินที่ไฟล์สังกัด) */
async function loadAttachment(user: CurrentUser, id: string) {
  const row = await prisma.attachment.findUnique({
    where: { id },
    include: {
      task: { select: { teamId: true, assigneeId: true } },
      comment: {
        select: { task: { select: { teamId: true, assigneeId: true } }, standup: { select: { teamId: true, userId: true } } },
      },
    },
  });
  if (!row || !row.uploadedAt) return null;
  const task = row.task ?? row.comment?.task;
  const standup = row.comment?.standup;
  const target = task ? { teamId: task.teamId, ownerId: task.assigneeId } : standup ? { teamId: standup.teamId, ownerId: standup.userId } : null;
  if (!target) return null; // เจ้าของถูกลบไปแล้ว รอ cron เก็บกวาด
  return { row, access: await teamAccess(user, target) };
}

/** mark ว่าสำคัญ = เก็บไว้ถาวรและขึ้นในหน้า ไฟล์ · เลิก mark = กลับไปนับถอยหลังใหม่ — ทุกคนที่เห็นไฟล์ทำได้ */
export async function setAttachmentImportant(id: string, important: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const found = await loadAttachment(user, String(id));
  if (!found?.access.read) return { ok: false };
  await prisma.attachment.update({
    where: { id: found.row.id },
    data: important ? { importantAt: new Date(), importantById: user.id } : { importantAt: null, importantById: null, expiresAt: newExpiry() },
  });
  done();
  return { ok: true };
}

/** ลบได้: คนที่อัปโหลด หรือคนที่ดูแลทีม */
export async function deleteAttachment(id: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const found = await loadAttachment(user, String(id));
  if (!found || !(found.access.manage || (found.access.read && found.row.uploaderId === user.id))) return { ok: false };
  try {
    await purgeAttachments({ id: found.row.id });
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
  done();
  return { ok: true };
}
