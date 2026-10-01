import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

/**
 * ล้าง session แล้วกลับหน้า login — ใช้เมื่อ cookie ยังถูกต้องแต่บัญชีถูกปิด/ลบไปแล้ว
 * (ลบ cookie ระหว่าง render ไม่ได้ จึงต้องผ่าน route handler ไม่งั้น proxy จะ redirect วนไม่จบ)
 */
export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
