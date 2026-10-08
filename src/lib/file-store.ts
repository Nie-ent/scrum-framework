import "server-only";
import { MAX_FILE_BYTES } from "./attachments";
import { storage, call, type StorageConfig } from "./supabase-storage";

/**
 * ที่เก็บไฟล์แนบ — Supabase Storage bucket ส่วนตัว (ไม่ตั้ง SUPABASE_URL + SUPABASE_SECRET_KEY = ปิดฟีเจอร์แนบไฟล์)
 * เบราว์เซอร์อัปโหลด/ดาวน์โหลดตรงกับ Storage ผ่าน signed URL อายุสั้น ไฟล์จึงไม่ผ่าน server ของเรา
 * (Vercel จำกัด request ไว้ 4.5 MB) และ secret key ไม่ออกไปฝั่ง browser
 */
const BUCKET = process.env.SUPABASE_ATTACHMENT_BUCKET ?? "file";

export const isFileStorageConfigured = () => storage() !== null;

function config(): StorageConfig {
  const cfg = storage();
  if (!cfg) throw new Error("file storage is not configured");
  return cfg;
}

let bucketReady = false;
async function ensureBucket(cfg: StorageConfig) {
  if (bucketReady) return;
  const found = await fetch(`${cfg.base}/bucket/${BUCKET}`, { headers: cfg.headers, cache: "no-store" });
  if (!found.ok) {
    const res = await fetch(`${cfg.base}/bucket`, {
      method: "POST",
      headers: { ...cfg.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_FILE_BYTES }),
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok && !/exist/i.test(body)) throw new Error(`supabase storage create bucket failed: ${res.status} ${body.slice(0, 300)}`);
  }
  bucketReady = true;
}

const json = { "Content-Type": "application/json" };

/** URL ให้เบราว์เซอร์ PUT ไฟล์ขึ้นไปเองได้ครั้งเดียว */
export async function createUploadUrl(path: string): Promise<string> {
  const cfg = config();
  await ensureBucket(cfg);
  const res = await call(cfg, "sign upload", `/object/upload/sign/${BUCKET}/${path}`, { method: "POST", headers: json, body: "{}" });
  const data = (await res.json()) as { url?: string };
  if (!res.ok || !data.url) throw new Error(`supabase storage sign upload failed: ${res.status}`);
  return `${cfg.base}${data.url}`;
}

/** ขนาดไฟล์ที่อยู่ใน Storage จริง — null = ยังไม่มีไฟล์ */
export async function storedSize(path: string): Promise<number | null> {
  const cfg = config();
  const res = await call(cfg, "list", `/object/list/${BUCKET}`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ prefix: "", search: path, limit: 10 }),
  });
  if (!res.ok) return null;
  const items = (await res.json()) as { name: string; metadata?: { size?: number } | null }[];
  const found = items.find((i) => i.name === path);
  return found ? (found.metadata?.size ?? 0) : null;
}

/** URL ดาวน์โหลดอายุ 1 นาที — downloadName = บังคับดาวน์โหลดด้วยชื่อนี้ (ไม่ใส่ = เปิดดูในเบราว์เซอร์) */
export async function createDownloadUrl(path: string, downloadName?: string): Promise<string | null> {
  const cfg = config();
  const res = await call(cfg, "sign download", `/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { signedURL?: string };
  if (!data.signedURL) return null;
  return `${cfg.base}${data.signedURL}${downloadName ? `&download=${encodeURIComponent(downloadName)}` : ""}`;
}

export async function removeStoredFiles(paths: string[]) {
  if (paths.length === 0) return;
  await call(config(), "delete", `/object/${BUCKET}`, { method: "DELETE", headers: json, body: JSON.stringify({ prefixes: paths }) });
}
