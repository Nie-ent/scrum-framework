/**
 * สิทธิ์ทั้งหมดตัดสินจาก Role.level (ตัวเลขยิ่งมากสิทธิ์ยิ่งสูง)
 * สร้าง Role ใหม่ได้เองจากหน้า Admin แล้วกำหนด level ให้ตรงกับขั้นที่ต้องการ
 */
export const LEVEL = {
  /** ส่ง daily scrum ของตัวเองได้ */
  MEMBER: 10,
  /** ดูภาพรวม scrum ของทีมตัวเอง */
  LEAD: 50,
  /** ดูภาพรวมทุกทีม */
  MANAGER: 80,
  /** จัดการผู้ใช้ / role / ทีม */
  ADMIN: 100,
} as const;

export const canViewTeamOverview = (level: number) => level >= LEVEL.LEAD;
export const canViewAllTeams = (level: number) => level >= LEVEL.MANAGER;
export const canAdmin = (level: number) => level >= LEVEL.ADMIN;

export function levelLabel(level: number) {
  if (level >= LEVEL.ADMIN) return "Admin";
  if (level >= LEVEL.MANAGER) return "Manager";
  if (level >= LEVEL.LEAD) return "Lead";
  return "Member";
}
