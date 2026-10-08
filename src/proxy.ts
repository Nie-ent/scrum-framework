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
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && guestOnly) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

// ไม่ผ่านการเช็ค session:
// - manifest.webmanifest / sw.js: เบราว์เซอร์ดึงเองโดยอาจไม่มี cookie
// - api/cron: ตรวจสิทธิ์ด้วย CRON_SECRET ใน route เอง
export const config = {
  matcher: ["/((?!api/health|api/cron|sw.js|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
