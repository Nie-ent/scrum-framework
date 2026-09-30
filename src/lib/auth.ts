import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, decryptSession } from "./session";

/** โหลด user จาก DB ทุก request เพื่อให้การเปลี่ยน role มีผลทันที */
export const getCurrentUser = cache(async () => {
  const session = await decryptSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { role: true, team: true },
  });
  if (!user || !user.active) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** ใช้ใน page / server action: ถ้าไม่ login หรือ level ไม่ถึงจะ redirect */
export async function requireUser(minLevel = 0): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role.level < minLevel) redirect("/standup");
  return user;
}
