import "server-only";

/**
 * ตั้งค่า Supabase Storage ที่ใช้ร่วมกัน (รูปโปรไฟล์, ไฟล์แนบ) — null = ไม่ได้ตั้ง SUPABASE_URL + SUPABASE_SECRET_KEY
 *
 * เรียก Storage REST API ตรง ๆ (ไม่ใช้ supabase-js) เพื่อคุม header เอง:
 * secret key แบบใหม่ (sb_secret_...) ต้องอยู่ใน header `apikey` เท่านั้น — ถ้าส่งเป็น Bearer ด้วย
 * Storage จะพยายามอ่านเป็น JWT แล้วปฏิเสธ (ดู https://supabase.com/docs/guides/api/api-keys)
 */
export type StorageConfig = { base: string; headers: Record<string, string> };

export function storage(): StorageConfig | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (!url || !key) return null;
  let origin: string;
  try {
    // ใช้แค่ https://<ref>.supabase.co — ตัด path ที่อาจใส่มาเกิน เช่น /rest/v1 หรือ /storage/v1
    origin = new URL(url).origin;
  } catch {
    console.error("SUPABASE_URL is not a valid URL — Supabase Storage is disabled");
    return null;
  }
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_")) headers.Authorization = `Bearer ${key}`; // service_role JWT แบบเก่า
  return { base: `${origin}/storage/v1`, headers };
}

export async function call(cfg: StorageConfig, op: string, path: string, init: RequestInit = {}) {
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
