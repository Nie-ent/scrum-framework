import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, decryptSession } from "./session";
import { canViewOverview } from "./permissions";

/** โหลด user จาก DB ทุก request เพื่อให้การเปลี่ยน role มีผลทันที */
export const getCurrentUser = cache(async () => {
  const session = await decryptSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: true, memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } } },
  });
  if (!user || !user.active) return null;
  // session ที่ออกก่อนเปลี่ยนรหัสผ่านใช้ไม่ได้ (เผื่อ 1 วินาที เพราะ iat ปัดเป็นวินาที)
  if (user.passwordChangedAt && session.issuedAt * 1000 < user.passwordChangedAt.getTime() - 1000) return null;
  return user;
});

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
