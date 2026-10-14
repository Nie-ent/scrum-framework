import { randomUUID } from "node:crypto";
import type { TeamAccess } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

/** ข้อมูลทดสอบชุดหนึ่ง (ชื่อมีรหัสสุ่ม) — cleanup() ลบทั้งหมดที่สร้าง */
export async function makeWorld() {
  const tag = randomUUID().slice(0, 8);
  const role = await prisma.role.findUniqueOrThrow({ where: { name: "Member" } });
  const userIds: string[] = [];
  const teamIds: string[] = [];

  const user = async (name: string) => {
    const u = await prisma.user.create({ data: { email: `${name.toLowerCase().replace(/\s+/g, ".")}.${tag}@test.local`, name, passwordHash: "x", roleId: role.id } });
    userIds.push(u.id);
    return u;
  };
  const team = async (name: string, members: [{ id: string }, TeamAccess, boolean?][], parentId: string | null = null) => {
    const t = await prisma.team.create({ data: { name: `${name} ${tag}`, parentId } });
    teamIds.unshift(t.id);
    await prisma.teamMember.createMany({ data: members.map(([u, access, participates = true]) => ({ userId: u.id, teamId: t.id, access, participates })) });
    return t;
  };
  /** โหลดผู้ใช้รูปเดียวกับ getCurrentUser (สิทธิ์ใช้ข้อมูลนี้) */
  const as = async (id: string): Promise<CurrentUser> =>
    (await prisma.user.findUniqueOrThrow({ where: { id }, include: { role: true, memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } } } })) as CurrentUser;

  const cleanup = async () => {
    // ทีมลูกก่อนทีมแม่ (teamIds เรียงจากที่สร้างทีหลังสุด)
    for (const id of teamIds) await prisma.team.delete({ where: { id } }).catch(() => undefined);
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  };
  const notices = (userId: string) => prisma.notification.findMany({ where: { userId }, orderBy: { id: "asc" }, select: { title: true, body: true, url: true } });
  return { tag, user, team, as, cleanup, notices };
}
