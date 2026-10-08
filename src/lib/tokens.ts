import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** token สุ่มสำหรับใส่ในลิงก์ — ใน database เก็บเฉพาะ hash เพื่อให้ข้อมูลรั่วแล้วเอาไปใช้ไม่ได้ */
export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
export const inHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000);
