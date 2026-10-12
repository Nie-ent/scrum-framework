import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/invites";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SSO_COOKIE, beginSso, getProvider } from "@/lib/sso";

/** เริ่มเข้าสู่ระบบด้วย Google/Microsoft: จำ state ไว้ใน cookie แล้วพาไปหน้าของผู้ให้บริการ · ?link=1 = ผูกกับบัญชีที่ล็อกอินอยู่ */
export async function GET(request: Request, { params }: RouteContext<"/api/auth/[provider]/start">) {
  const provider = getProvider((await params).provider);
  const url = new URL(request.url);
  const to = (path: string) => new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
  if (!provider) return to("/login?sso=unavailable");
  if (!(await rateLimit(`sso:start:${await clientIp()}`, 30, 600))) return to("/login?sso=busy");

  let linkUserId: string | undefined;
  if (url.searchParams.get("link") === "1") {
    const user = await getCurrentUser();
    if (!user) return to("/login");
    linkUserId = user.id;
  }
  const begun = await beginSso(provider, safeNextPath(url.searchParams.get("next")), linkUserId);
  const response = NextResponse.redirect(begun.url);
  response.cookies.set(SSO_COOKIE, begun.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    // lax: cookie ต้องกลับมาด้วยตอนผู้ให้บริการพาผู้ใช้กลับ (เป็นการนำทางระดับบนสุด)
    sameSite: "lax",
    path: "/api/auth",
    maxAge: begun.maxAge,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
