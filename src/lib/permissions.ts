/**
 * สิทธิ์ระดับระบบตัดสินจาก Role.level (ตัวเลขยิ่งมากสิทธิ์ยิ่งสูง)
 * ส่วนสิทธิ์ดูภาพรวมทีมมาจากการเป็นหัวหน้าทีม (TeamMember.isLead) — ดู src/lib/teams.ts
 */
export const LEVEL = {
  /** ส่ง daily scrum ของตัวเองได้ */
  MEMBER: 10,
  /** ดูภาพรวมทุกทีม */
  MANAGER: 80,
  /** จัดการผู้ใช้ / role / ทีม */
  ADMIN: 100,
} as const;

type Viewer = { role: { level: number }; memberships: { isLead: boolean }[] };

export const canViewAllTeams = (level: number) => level >= LEVEL.MANAGER;
export const canAdmin = (level: number) => level >= LEVEL.ADMIN;
export const canViewOverview = (user: Viewer) =>
  canViewAllTeams(user.role.level) || user.memberships.some((m) => m.isLead);

export function levelLabel(level: number) {
  if (level >= LEVEL.ADMIN) return "Admin";
  if (level >= LEVEL.MANAGER) return "Manager";
  return "Member";
}

/** "Alpha ★, Web" — ★ = หัวหน้าทีม */
export function teamsLabel(memberships: { isLead: boolean; team: { name: string } }[]) {
  if (memberships.length === 0) return "ไม่มีทีม";
  return memberships.map((m) => `${m.team.name}${m.isLead ? " ★" : ""}`).join(", ");
}
