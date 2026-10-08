/**
 * สิทธิ์มี 2 ระดับ
 * - ระดับทีม: TeamMember.access (OWNER / LEAD / MEMBER) — ใครเห็นภาพรวมและมอบหมายงานของทีมไหน (ดู src/lib/teams.ts)
 * - ระดับระบบ: Role.level ≥ ADMIN = ผู้ดูแลแพลตฟอร์ม เข้าหน้า /admin ได้ (ไม่ได้ให้สิทธิ์เห็นข้อมูลในทีม)
 */
export const LEVEL = {
  /** role ตั้งต้นของผู้ใช้ทั่วไป */
  MEMBER: 10,
  /** จัดการผู้ใช้ / role / ทีม ทั้งระบบ */
  ADMIN: 100,
} as const;

type Access = "OWNER" | "LEAD" | "MEMBER";
type Membership = { access: Access };
type Viewer = { memberships: Membership[] };

export const canAdmin = (level: number) => level >= LEVEL.ADMIN;
/** OWNER / LEAD เห็นภาพรวมและมอบหมายงานในทีมนั้น (รวมทีมย่อย) */
export const canLead = (m: Membership) => m.access !== "MEMBER";
export const canViewOverview = (user: Viewer) => user.memberships.some(canLead);

export function levelLabel(level: number) {
  return level >= LEVEL.ADMIN ? "Admin" : "Member";
}

export const ACCESS_LABEL: Record<Access, string> = { OWNER: "เจ้าของทีม", LEAD: "หัวหน้าทีม", MEMBER: "สมาชิก" };

/** "Alpha ★, Web" — ★ = หัวหน้า/เจ้าของทีม */
export function teamsLabel(memberships: (Membership & { team: { name: string } })[]) {
  if (memberships.length === 0) return "ไม่มีทีม";
  return memberships.map((m) => `${m.team.name}${canLead(m) ? " ★" : ""}`).join(", ");
}
