import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * ล้าง session แล้วกลับหน้า login — ใช้เมื่อ cookie ยังถูกต้องแต่บัญชีถูกปิด/ลบไปแล้ว
 * (ลบ cookie ระหว่าง render ไม่ได้ จึงต้องผ่าน route handler ไม่งั้น proxy จะ redirect วนไม่จบ)
 */
export function GET() {
  // Location แบบ relative: ใน standalone/Docker request.url เป็น host ภายใน (0.0.0.0) ใช้สร้าง URL เต็มไม่ได้
  const response = new NextResponse(null, { status: 307, headers: { Location: "/login" } });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
