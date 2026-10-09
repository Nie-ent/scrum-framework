import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { canAdmin, canLead } from "./permissions";

export type TeamRow = { id: string; name: string; parentId: string | null };

/** ลิงก์ห้องประชุมของทีม — ทีมย่อยที่ไม่ได้ตั้งเองใช้ของทีมแม่ */
export async function getMeetingUrl(teamId: string): Promise<string | null> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { meetingUrl: true, parent: { select: { meetingUrl: true } } } });
  return team?.meetingUrl ?? team?.parent?.meetingUrl ?? null;
}

/** เรียงแบบต้นไม้: ทีมใหญ่ตามด้วยทีมย่อยของมัน (ทีมย่อยที่ไม่เห็นทีมแม่ขึ้นเป็นระดับบน) */
export function sortTeamTree<T extends TeamRow>(teams: T[]): T[] {
  const ids = new Set(teams.map((t) => t.id));
  const roots = teams.filter((t) => !t.parentId || !ids.has(t.parentId));
  return roots.flatMap((root) => [root, ...teams.filter((t) => t.parentId === root.id)]);
}

/** ทีมที่ viewer ดูภาพรวมได้ = ทีมที่ตัวเองเป็นหัวหน้า/เจ้าของ + ทีมย่อยของทีมนั้น */
export async function getVisibleTeams(viewer: CurrentUser): Promise<TeamRow[]> {
  const leadOf = viewer.memberships.filter(canLead).map((m) => m.teamId);
  if (leadOf.length === 0) return [];
  const teams = await prisma.team.findMany({
    where: { OR: [{ id: { in: leadOf } }, { parentId: { in: leadOf } }] },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
  return sortTeamTree(teams);
}

/** ทีมนั้น + ทีมย่อย (เฉพาะที่อยู่ใน teams) */
export function teamWithChildren(teams: TeamRow[], teamId: string): TeamRow[] {
  return teams.filter((t) => t.id === teamId || t.parentId === teamId);
}

/** ทีมที่ viewer มอบหมาย/แก้ไขงานของคนอื่นได้ = ทีมที่ดูภาพรวมได้ (หัวหน้า/เจ้าของทีม หรือของทีมแม่) */
export async function getManageableTeamIds(viewer: CurrentUser): Promise<Set<string>> {
  return new Set((await getVisibleTeams(viewer)).map((t) => t.id));
}

/**
 * สิทธิ์จัดการทีม (สมาชิก/คำเชิญ) — สิทธิ์ของทีมแม่ใช้กับทีมย่อยด้วย
 * owner = แก้สิทธิ์/ลบสมาชิก/ตั้งค่าทีมได้ (รวมผู้ดูแลแพลตฟอร์ม) · lead = เชิญสมาชิกทั่วไปได้
 */
export async function getTeamControl(viewer: CurrentUser, teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, name: true, parentId: true, meetingUrl: true } });
  if (!team) return null;
  const mine = viewer.memberships.filter((m) => m.teamId === team.id || m.teamId === team.parentId);
  const owner = canAdmin(viewer.role.level) || mine.some((m) => m.access === "OWNER");
  return { team, owner, lead: owner || mine.some(canLead), member: viewer.memberships.some((m) => m.teamId === team.id) };
}
