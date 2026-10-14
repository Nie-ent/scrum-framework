import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decryptSession } from "@/lib/session";

// หน้าที่เปิดได้โดยไม่ต้อง login
const GUEST_ONLY = ["/login", "/signup", "/forgot-password"]; // login แล้วเข้าไม่ได้ (ส่งกลับหน้าแรก)
const PUBLIC_PREFIXES = ["/reset-password/", "/verify-email/", "/invite/"]; // เปิดได้ทั้งสองสถานะ

// ตรวจแค่ว่ามี session ที่ถูกต้อง — การเช็คสิทธิ์ทำใน page/action (requireUser)
export async function proxy(request: NextRequest) {
  const session = await decryptSession(request.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = request.nextUrl;
  const guestOnly = GUEST_ONLY.includes(pathname);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!session && !guestOnly && !isPublic) {
    const login = new URL("/login", request.url);
    // หน้ายินยอม OAuth: ล็อกอินเสร็จแล้วกลับมาทำต่อ (คำขอทั้งหมดอยู่ใน query)
    if (pathname === "/oauth/authorize") login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  if (session && guestOnly) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

// ไม่ผ่านการเช็ค session:
// - manifest.webmanifest / sw.js: เบราว์เซอร์ดึงเองโดยอาจไม่มี cookie
// - api/cron: ตรวจสิทธิ์ด้วย CRON_SECRET ใน route เอง
// - api/oauth, .well-known: ปลายทาง OAuth ที่โปรแกรมเรียกโดยไม่มี cookie · api/auth: เข้าสู่ระบบด้วย Google/Microsoft
// - api/mcp: ผู้ช่วย AI ยืนยันตัวด้วยโทเคนส่วนตัว (Authorization: Bearer) ใน route เอง
// - api/stripe/webhook: Stripe เรียกเอง ตรวจด้วยลายเซ็น (STRIPE_WEBHOOK_SECRET) ใน route
export const config = {
  matcher: ["/((?!api/health|api/cron|api/mcp|api/stripe/webhook|api/oauth|api/auth/|\\.well-known|sw.js|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
