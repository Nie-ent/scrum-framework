import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { canViewAllTeams } from "./permissions";

export type TeamRow = { id: string; name: string; parentId: string | null };

/** เรียงแบบต้นไม้: ทีมใหญ่ตามด้วยทีมย่อยของมัน (ทีมย่อยที่ไม่เห็นทีมแม่ขึ้นเป็นระดับบน) */
export function sortTeamTree<T extends TeamRow>(teams: T[]): T[] {
  const ids = new Set(teams.map((t) => t.id));
  const roots = teams.filter((t) => !t.parentId || !ids.has(t.parentId));
  return roots.flatMap((root) => [root, ...teams.filter((t) => t.parentId === root.id)]);
}

/**
 * ทีมที่ viewer ดูภาพรวมได้
 * - Manager ขึ้นไป: ทุกทีม
 * - หัวหน้าทีม: ทีมที่ตัวเองเป็นหัวหน้า + ทีมย่อยของทีมนั้น
 */
export async function getVisibleTeams(viewer: CurrentUser): Promise<TeamRow[]> {
  const all = await prisma.team.findMany({
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
  if (canViewAllTeams(viewer.role.level)) return sortTeamTree(all);

  const leadOf = new Set(viewer.memberships.filter((m) => m.isLead).map((m) => m.teamId));
  return sortTeamTree(all.filter((t) => leadOf.has(t.id) || (t.parentId !== null && leadOf.has(t.parentId))));
}

/** ทีมนั้น + ทีมย่อย (เฉพาะที่อยู่ใน teams) */
export function teamWithChildren(teams: TeamRow[], teamId: string): TeamRow[] {
  return teams.filter((t) => t.id === teamId || t.parentId === teamId);
}
