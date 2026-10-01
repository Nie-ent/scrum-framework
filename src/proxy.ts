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

// manifest.webmanifest ต้องเปิดได้โดยไม่ login — เบราว์เซอร์ดึงไฟล์นี้โดยไม่ส่ง cookie
export const config = {
  matcher: ["/((?!api/health|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
