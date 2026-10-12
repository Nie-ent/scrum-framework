import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isLang, LANG_COOKIE } from "@/lib/i18n/core";
import { isSignupOpen, openInvite } from "@/lib/invites";
import { publicOrigin } from "@/lib/origin";
import { createSession } from "@/lib/session";
import { SSO_COOKIE, fetchProfile, getProvider, readSsoState } from "@/lib/sso";
import { hashToken } from "@/lib/tokens";

/**
 * ผู้ให้บริการพาผู้ใช้กลับมาพร้อมรหัส — ตรวจ state, ถามข้อมูลผู้ใช้ แล้วหาบัญชี Pace ตามลำดับ:
 * 1) บัญชีที่ผูกกับตัวตนนี้ไว้แล้ว  2) กำลังผูกเข้ากับบัญชีที่ล็อกอินอยู่  3) บัญชีที่อีเมลตรงกัน (เฉพาะเมื่อผู้ให้บริการยืนยันอีเมลให้)
 * 4) สร้างบัญชีใหม่ (เมื่อเปิดให้สมัคร หรือมาจากลิงก์คำเชิญ)
 */
export async function GET(request: Request, { params }: RouteContext<"/api/auth/[provider]/callback">) {
  const provider = getProvider((await params).provider);
  const url = new URL(request.url);
  const jar = await cookies();
  const saved = await readSsoState(jar.get(SSO_COOKIE)?.value);
  jar.delete({ name: SSO_COOKIE, path: "/api/auth" });
  const to = (path: string) => new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
  const fail = (reason: string) => to(saved?.linkUserId ? `/account?sso=${reason}` : `/login?sso=${reason}`);

  if (!provider) return fail("unavailable");
  if (url.searchParams.get("error")) return fail("cancelled");
  const code = url.searchParams.get("code");
  if (!saved || saved.provider !== provider.id || !code || url.searchParams.get("state") !== saved.state) return fail("expired");

  const profile = await fetchProfile(provider, await publicOrigin(), code, saved.verifier);
  if (!profile) return fail("failed");

  const identity = await prisma.userIdentity.findUnique({ where: { provider_subject: { provider: provider.id, subject: profile.subject } }, include: { user: true } });

  // ผูกเข้ากับบัญชีที่ล็อกอินอยู่ (กดจากหน้าบัญชี)
  if (saved.linkUserId) {
    const current = await getCurrentUser();
    if (!current || current.id !== saved.linkUserId) return to("/login");
    if (identity) return to(identity.userId === current.id ? "/account?sso=linked" : "/account?sso=taken");
    try {
      await prisma.userIdentity.create({ data: { provider: provider.id, subject: profile.subject, userId: current.id, email: profile.email } });
    } catch {
      // บัญชีนี้ผูกกับผู้ให้บริการรายนี้ด้วยอีกบัญชีอยู่แล้ว
      return to("/account?sso=already");
    }
    return to("/account?sso=linked");
  }

  let user = identity?.user ?? null;
  if (!user) {
    const existing = await prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      // อีเมลตรงกับบัญชีเดิม: ผูกให้เองได้เฉพาะเมื่อผู้ให้บริการยืนยันว่าอีเมลเป็นของคนนี้จริง — ไม่งั้นคนอื่นอาจยึดบัญชีได้
      if (!profile.emailVerified) return fail("link_required");
      await prisma.userIdentity.create({ data: { provider: provider.id, subject: profile.subject, userId: existing.id, email: profile.email } });
      if (!existing.emailVerifiedAt) await prisma.user.update({ where: { id: existing.id }, data: { emailVerifiedAt: new Date() } });
      user = existing;
    } else {
      // ยังไม่มีบัญชี: สร้างได้เมื่อเปิดให้สมัครเอง หรือมาจากลิงก์คำเชิญที่ยังใช้ได้ (กฎเดียวกับการสมัครด้วยรหัสผ่าน)
      if (!isSignupOpen()) {
        const token = saved.next.startsWith("/invite/") ? saved.next.slice("/invite/".length) : "";
        const invited = token && (await prisma.invite.findFirst({ where: { tokenHash: hashToken(token), ...openInvite() } }));
        if (!invited) return fail("no_account");
      }
      const role = (await prisma.role.findUnique({ where: { name: "Member" } })) ?? (await prisma.role.findFirst({ orderBy: { level: "asc" } }));
      if (!role) return fail("failed");
      user = await prisma.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          // ไม่มีรหัสผ่านที่ใครรู้ — ตั้งเองได้ภายหลังด้วย "ลืมรหัสผ่าน"
          passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 10),
          roleId: role.id,
          emailVerifiedAt: profile.emailVerified ? new Date() : null,
          identities: { create: { provider: provider.id, subject: profile.subject, email: profile.email } },
        },
      });
    }
  }
  if (!user.active) return fail("inactive");

  await createSession(user.id, true);
  if (!jar.get(LANG_COOKIE) && isLang(user.locale)) jar.set(LANG_COOKIE, user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return to(saved.next);
}
