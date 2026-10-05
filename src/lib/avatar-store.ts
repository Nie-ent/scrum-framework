import "server-only";
import { prisma } from "./db";

/**
 * ที่เก็บรูปโปรไฟล์
 * - ตั้ง SUPABASE_URL + SUPABASE_SECRET_KEY → เก็บใน Supabase Storage (bucket ส่วนตัว)
 * - ไม่ได้ตั้ง (เช่น Docker/เครื่อง dev) → เก็บในตาราง Avatar ของ database
 * รูปเก่าที่ยังอยู่ใน database ยังอ่านได้ และย้ายไป Storage เองเมื่ออัปโหลดรูปใหม่
 *
 * เรียก Storage REST API ตรง ๆ (ไม่ใช้ supabase-js) เพื่อคุม header เอง:
 * secret key แบบใหม่ (sb_secret_...) ต้องอยู่ใน header `apikey` เท่านั้น — ถ้าส่งเป็น Bearer ด้วย
 * Storage จะพยายามอ่านเป็น JWT แล้วปฏิเสธ (ดู https://supabase.com/docs/guides/api/api-keys)
 */
const BUCKET = process.env.SUPABASE_AVATAR_BUCKET ?? "profile_images";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type StorageConfig = { base: string; headers: Record<string, string> };

function storage(): StorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) return null;
  let origin: string;
  try {
    // ใช้แค่ https://<ref>.supabase.co — ตัด path ที่อาจใส่มาเกิน เช่น /rest/v1 หรือ /storage/v1
    origin = new URL(url).origin;
  } catch {
    console.error("SUPABASE_URL is not a valid URL — storing avatars in the database");
    return null;
  }
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`; // service_role JWT แบบเก่า
  return { base: `${origin}/storage/v1`, headers };
}

async function call(cfg: StorageConfig, op: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${cfg.base}${path}`, {
    ...init,
    headers: { ...cfg.headers, ...(init.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 404) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`supabase storage ${op} failed: ${res.status} ${body}`);
  }
  return res;
}

let bucketReady = false;
async function ensureBucket(cfg: StorageConfig) {
  if (bucketReady) return;
  // Storage ตอบ "ไม่พบ bucket" เป็น 400 หรือ 404 แล้วแต่เวอร์ชัน — ไม่ใช่ 200 ก็ลองสร้าง
  // (ถ้าเป็นปัญหาสิทธิ์จริง การสร้างจะล้มพร้อมข้อความจาก Supabase ด้านล่าง)
  const found = await fetch(`${cfg.base}/bucket/${BUCKET}`, { headers: cfg.headers, cache: "no-store" });
  if (!found.ok) {
    const res = await fetch(`${cfg.base}/bucket`, {
      method: "POST",
      headers: { ...cfg.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: BUCKET,
        name: BUCKET,
        public: false,
        file_size_limit: 300 * 1024,
        allowed_mime_types: ALLOWED_TYPES,
      }),
      cache: "no-store",
    });
    const body = await res.text();
    // อีก request สร้างไปก่อนพร้อมกันได้ — ถือว่าโอเค
    if (!res.ok && !/exist/i.test(body)) throw new Error(`supabase storage create bucket failed: ${res.status} ${body.slice(0, 300)}`);
  }
  bucketReady = true;
}

const objectPath = (userId: string) => `/object/${BUCKET}/${encodeURIComponent(userId)}`;

export async function saveAvatarImage(userId: string, data: Uint8Array<ArrayBuffer>, mimeType: string) {
  const cfg = storage();
  if (!cfg) {
    await prisma.avatar.upsert({
      where: { userId },
      create: { userId, data, mimeType },
      update: { data, mimeType },
    });
    return;
  }
  await ensureBucket(cfg);
  const res = await call(cfg, "upload", objectPath(userId), {
    method: "POST",
    headers: { "Content-Type": mimeType, "x-upsert": "true", "cache-control": "max-age=3600" },
    body: data,
  });
  if (!res.ok) throw new Error(`supabase storage upload failed: ${res.status}`);
  // ย้ายเสร็จแล้ว ไม่ต้องเก็บสำเนาใน database
  await prisma.avatar.deleteMany({ where: { userId } });
}

export async function loadAvatarImage(userId: string): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string } | null> {
  const cfg = storage();
  if (cfg) {
    try {
      const res = await fetch(`${cfg.base}${objectPath(userId)}`, { headers: cfg.headers, cache: "no-store" });
      if (res.ok) {
        return { data: new Uint8Array(await res.arrayBuffer()), mimeType: res.headers.get("content-type") ?? "image/jpeg" };
      }
      // 400/404 = ยังไม่มีไฟล์ใน Storage (เช่นรูปเก่าที่ยังอยู่ใน database) — ไม่ใช่ error
      if (res.status !== 400 && res.status !== 404) {
        console.error(`supabase storage download failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      }
    } catch (e) {
      // ยังมีรูปใน database ให้ใช้ได้ — ไม่ให้หน้าเว็บพังเพราะ Storage มีปัญหา
      console.error(e);
    }
  }
  const row = await prisma.avatar.findUnique({ where: { userId } });
  return row ? { data: new Uint8Array(row.data), mimeType: row.mimeType } : null;
}

export async function deleteAvatarImage(userId: string) {
  const cfg = storage();
  if (cfg) {
    await call(cfg, "delete", `/object/${BUCKET}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [userId] }),
    });
  }
  await prisma.avatar.deleteMany({ where: { userId } });
}
