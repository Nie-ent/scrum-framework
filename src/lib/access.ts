import "server-only";
import type { CurrentUser } from "./auth";
import { canViewAllTeams } from "./permissions";
import { getManageableTeamIds } from "./teams";

/**
 * สิทธิ์ต่อสิ่งที่อยู่ในทีม (งาน, เช็กอิน, ความคิดเห็น, ไฟล์แนบ)
 * read = คนในทีมเดียวกันหรือคนที่ดูแลทีมนั้น · manage = คนที่ดูแลทีม (ลบของคนอื่นได้)
 */
export async function teamAccess(user: CurrentUser, target: { teamId: string | null; ownerId: string }) {
  // เช็กอินเก่าที่ไม่มีทีม: เห็นได้เฉพาะเจ้าของและ Manager ขึ้นไป
  if (!target.teamId) {
    const manage = canViewAllTeams(user.role.level);
    return { read: manage || target.ownerId === user.id, manage };
  }
  const manage = (await getManageableTeamIds(user)).has(target.teamId);
  return { read: manage || user.memberships.some((m) => m.teamId === target.teamId), manage };
}
