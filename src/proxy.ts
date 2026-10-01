import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, decryptSession } from "@/lib/session";

// ตรวจแค่ว่ามี session ที่ถูกต้อง — การเช็คสิทธิ์ตาม role level ทำใน page/action (requireUser)
export async function proxy(request: NextRequest) {
  const session = await decryptSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = request.nextUrl.pathname === "/login";

  if (!session && !isLogin) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (session && isLogin) {
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
