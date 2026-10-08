import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "scrum_session";
/** ติ๊ก "จดจำฉันไว้" = อยู่ในระบบ 30 วันบนเครื่องนี้ — ไม่ติ๊ก = หลุดเมื่อปิดเบราว์เซอร์ (token อยู่ได้ไม่เกิน 1 วัน) */
const REMEMBER_SECONDS = 60 * 60 * 24 * 30;
const SHORT_SECONDS = 60 * 60 * 24;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set (at least 32 characters)");
  }
  return new TextEncoder().encode(secret);
}

export async function encryptSession(userId: string, maxAgeSeconds = REMEMBER_SECONDS) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function decryptSession(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    // issuedAt (วินาที) ใช้ตัด session ที่ออกก่อนเปลี่ยนรหัสผ่าน
    return typeof payload.sub === "string" ? { userId: payload.sub, issuedAt: payload.iat ?? 0 } : null;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, remember = true) {
  const token = await encryptSession(userId, remember ? REMEMBER_SECONDS : SHORT_SECONDS);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    // ตั้ง COOKIE_SECURE=false เฉพาะตอนรันผ่าน http (เช่น docker บนเครื่อง)
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    // ไม่ใส่ maxAge = cookie หายเมื่อปิดเบราว์เซอร์
    ...(remember ? { maxAge: REMEMBER_SECONDS } : {}),
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
