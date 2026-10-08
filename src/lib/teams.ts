import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { canLead } from "./permissions";

export type TeamRow = { id: string; name: string; parentId: string | null };

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
