import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, decryptSession } from "./session";
import { canViewOverview } from "./permissions";
import { ensurePersonalSpace } from "./personal";
import { ensureLang, tr } from "./i18n/server";

/** โหลด user จาก DB ทุก request เพื่อให้การเปลี่ยน role มีผลทันที */
const loadUser = (id: string) =>
  prisma.user.findUnique({
    where: { id },
    include: { role: true, memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } } },
  });

export const getCurrentUser = cache(async () => {
  // ทุกหน้าที่ล็อกอินผ่านจุดนี้ — ตั้งภาษาของคำขอให้ tr() ใช้
  await ensureLang();
  const session = await decryptSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  let user = await loadUser(session.userId);
  if (!user || !user.active) return null;
  // ทุกคนมีพื้นที่ส่วนตัว — สร้างให้ครั้งแรกที่เข้าใช้ (รวมบัญชีที่มีอยู่ก่อนฟีเจอร์นี้)
  if (!user.memberships.some((m) => m.team.personalOfId === user!.id)) {
    await ensurePersonalSpace(user.id);
    user = await loadUser(session.userId);
    if (!user) return null;
  }
  // ทีมจริงขึ้นก่อน พื้นที่ส่วนตัวอยู่ท้าย — หน้าต่าง ๆ เลือกทีมแรกเป็นค่าเริ่มต้น
  user.memberships.sort((a, b) => Number(Boolean(a.team.personalOfId)) - Number(Boolean(b.team.personalOfId)));
  // ชื่อพื้นที่ส่วนตัวเป็นชื่อที่ระบบตั้ง ("ส่วนตัว") — แสดงตามภาษาที่ใช้อยู่ (ชื่อในฐานข้อมูลไม่เปลี่ยน)
  for (const m of user.memberships) if (m.team.personalOfId) m.team.name = tr(m.team.name);
  // session ที่ออกก่อนเปลี่ยนรหัสผ่านใช้ไม่ได้ (เผื่อ 1 วินาที เพราะ iat ปัดเป็นวินาที)
  if (user.passwordChangedAt && session.issuedAt * 1000 < user.passwordChangedAt.getTime() - 1000) return null;
  return user;
});

/**
 * ผู้ใช้จากโทเคนส่วนตัว (Authorization: Bearer …) — ใช้กับ /api/mcp ที่ไม่มี cookie
 * ได้ข้อมูลรูปเดียวกับ getCurrentUser จึงใช้กฎสิทธิ์ชุดเดียวกันได้ทั้งหมด
 */
export async function userFromApiToken(tokenHash: string) {
  const row = await prisma.apiToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, readOnly: true, lastUsedAt: true, expiresAt: true } });
  // โทเคนที่ออกผ่าน OAuth หมดอายุได้ — โปรแกรมจะต่ออายุด้วย refresh token เอง
  if (!row || (row.expiresAt && row.expiresAt < new Date())) return null;
  const user = await loadUser(row.userId);
  if (!user || !user.active) return null;
  user.memberships.sort((a, b) => Number(Boolean(a.team.personalOfId)) - Number(Boolean(b.team.personalOfId)));
  // บันทึกเวลาใช้ล่าสุดไม่เกินนาทีละครั้ง (ไม่เขียนฐานข้อมูลทุกคำขอ)
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  return { user, readOnly: row.readOnly };
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** ใช้ใน page / server action: ถ้าไม่ login หรือ level ไม่ถึงจะ redirect */
export async function requireUser(minLevel = 0): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // มี session แต่ไม่พบบัญชี (ถูกปิด/ลบ) → ต้องล้าง cookie ก่อน ไม่งั้นจะ redirect วนกับ proxy
  if (!user) redirect("/logout");
  if (user.role.level < minLevel) redirect("/standup");
  return user;
}

/** หน้าภาพรวม: ต้องเป็นหัวหน้า/เจ้าของอย่างน้อย 1 ทีม */
export async function requireOverviewAccess(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!canViewOverview(user)) redirect("/standup");
  return user;
}
