import "server-only";
import { headers } from "next/headers";
import { appUrl } from "./email";

const bare = (host: string) => host.toLowerCase().replace(/^www\./, "");

/**
 * ที่อยู่หลักของเว็บตามที่ผู้เรียกเข้ามาจริง (เช่น https://www.example.com) — ใช้กับ OAuth ที่ที่อยู่ต้องตรงกันทุกตัวอักษร
 * รับเฉพาะโดเมนเดียวกับ APP_URL (ต่างกันได้แค่มี/ไม่มี www) — host แปลกปลอมจะได้ค่า APP_URL แทน
 */
export async function publicOrigin(): Promise<string> {
  const base = new URL(appUrl());
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return host && bare(host) === bare(base.host) ? `${base.protocol}//${host}` : base.origin;
}
