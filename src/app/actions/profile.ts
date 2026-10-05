"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { deleteAvatarImage, saveAvatarImage } from "@/lib/avatar-store";
import type { FormState } from "./auth";

const MAX_AVATAR_BYTES = 300 * 1024;

const ProfileSchema = z.object({
  name: z.string().trim().min(1, { error: "กรุณาระบุชื่อ" }).max(100, { error: "ชื่อยาวเกิน 100 ตัวอักษร" }),
});

export async function updateProfile(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = ProfileSchema.safeParse({ name: formData.get("name") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await prisma.user.update({ where: { id: user.id }, data: { name: parsed.data.name } });
  revalidatePath("/", "layout");
  return { ok: "บันทึกโปรไฟล์แล้ว" };
}

/** ตรวจจากเนื้อไฟล์จริง (magic bytes) ไม่เชื่อ type ที่เบราว์เซอร์ส่งมา */
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return null;
}

/** รับรูปที่ย่อแล้วจากเบราว์เซอร์ (256×256) */
export async function uploadAvatar(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "ไม่พบไฟล์รูป" };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "ไฟล์รูปใหญ่เกินไป" };

  const data = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectImageType(data);
  if (!mimeType) return { ok: false, error: "รองรับเฉพาะรูป JPG, PNG หรือ WebP" };

  try {
    await saveAvatarImage(user.id, data, mimeType);
  } catch (e) {
    console.error(e);
    return { ok: false, error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  await prisma.user.update({ where: { id: user.id }, data: { avatarUpdatedAt: new Date() } });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatar(): Promise<{ ok: boolean }> {
  const user = await requireUser();
  // ซ่อนรูปก่อน แล้วค่อยลบไฟล์ — ถ้าลบไฟล์ไม่สำเร็จ ผู้ใช้ก็ไม่เห็นรูปแล้ว
  await prisma.user.update({ where: { id: user.id }, data: { avatarUpdatedAt: null } });
  await deleteAvatarImage(user.id).catch((e) => console.error(e));
  revalidatePath("/", "layout");
  return { ok: true };
}
