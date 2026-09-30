import "server-only";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "./auth";
import { canViewAllTeams } from "./permissions";

/**
 * ผู้ใช้ที่ viewer มีสิทธิ์ดู daily scrum
 * - Manager ขึ้นไป: ทุกทีม (กรองด้วย teamId ได้)
 * - Lead: เฉพาะทีมตัวเอง
 */
export function visibleUsersWhere(viewer: CurrentUser, teamId?: string): Prisma.UserWhereInput {
  if (canViewAllTeams(viewer.role.level)) {
    return { active: true, ...(teamId ? { teamId } : {}) };
  }
  // ไม่มีทีม → เห็นแค่ตัวเอง
  return { active: true, ...(viewer.teamId ? { teamId: viewer.teamId } : { id: viewer.id }) };
}
