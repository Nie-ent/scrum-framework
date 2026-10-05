import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "./db";

/**
 * ที่เก็บรูปโปรไฟล์
 * - ตั้ง SUPABASE_URL + SUPABASE_SECRET_KEY → เก็บใน Supabase Storage (bucket ส่วนตัว)
 * - ไม่ได้ตั้ง (เช่น Docker/เครื่อง dev) → เก็บในตาราง Avatar ของ database
 * รูปเก่าที่ยังอยู่ใน database ยังอ่านได้ และย้ายไป Storage เองเมื่ออัปโหลดรูปใหม่
 */
const BUCKET = process.env.SUPABASE_AVATAR_BUCKET ?? "profile_images";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

let cached: SupabaseClient | null | undefined;
function storage() {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  // ใช้ secret key แบบใหม่ (sb_secret_...) หรือ service_role แบบเก่าก็ได้ — ฝั่ง server เท่านั้น
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  return cached;
}

let bucketReady = false;
async function ensureBucket(sb: SupabaseClient) {
  if (bucketReady) return;
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 300 * 1024,
      allowedMimeTypes: ALLOWED_TYPES,
    });
    // อีก request สร้างไปก่อนพร้อมกันได้ — ถือว่าโอเค
    if (error && !/exist/i.test(error.message)) throw new Error(`create bucket failed: ${error.message}`);
  }
  bucketReady = true;
}

const objectPath = (userId: string) => userId;

export async function saveAvatarImage(userId: string, data: Uint8Array<ArrayBuffer>, mimeType: string) {
  const sb = storage();
  if (!sb) {
    await prisma.avatar.upsert({
      where: { userId },
      create: { userId, data, mimeType },
      update: { data, mimeType },
    });
    return;
  }
  await ensureBucket(sb);
  const { error } = await sb.storage
    .from(BUCKET)
    .upload(objectPath(userId), new Blob([data], { type: mimeType }), { contentType: mimeType, upsert: true });
  if (error) throw new Error(`avatar upload failed: ${error.message}`);
  // ย้ายเสร็จแล้ว ไม่ต้องเก็บสำเนาใน database
  await prisma.avatar.deleteMany({ where: { userId } });
}

export async function loadAvatarImage(userId: string): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string } | null> {
  const sb = storage();
  if (sb) {
    const { data } = await sb.storage.from(BUCKET).download(objectPath(userId));
    if (data) return { data: new Uint8Array(await data.arrayBuffer()), mimeType: data.type || "image/jpeg" };
  }
  const row = await prisma.avatar.findUnique({ where: { userId } });
  return row ? { data: new Uint8Array(row.data), mimeType: row.mimeType } : null;
}

export async function deleteAvatarImage(userId: string) {
  const sb = storage();
  if (sb) {
    const { error } = await sb.storage.from(BUCKET).remove([objectPath(userId)]);
    if (error) throw new Error(`avatar delete failed: ${error.message}`);
  }
  await prisma.avatar.deleteMany({ where: { userId } });
}
