import "server-only";
import { headers } from "next/headers";
import { prisma } from "./db";

/**
 * จำกัดความถี่แบบ fixed window เก็บใน database (ใช้ได้กับ serverless หลาย instance)
 * คืน true ถ้ายังไม่เกิน `limit` ครั้งใน `windowSeconds` — การนับเป็น atomic ด้วย upsert คำสั่งเดียว
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimit"."resetAt" END
    RETURNING "count"`;
  return (rows[0]?.count ?? 1) <= limit;
}

/** IP ของผู้เรียก (ตัวแรกใน x-forwarded-for ที่ proxy/Vercel ใส่ให้) */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export const TOO_MANY = "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
