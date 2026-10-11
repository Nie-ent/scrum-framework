import "server-only";
import { prisma } from "./db";

/** ชื่อที่แสดงของพื้นที่ส่วนตัว */
export const PERSONAL_NAME = "ส่วนตัว";

/**
 * พื้นที่ส่วนตัวของผู้ใช้ = ทีมที่มีเจ้าของคนเดียว (Team.personalOfId) สร้างให้อัตโนมัติครั้งแรกที่เข้าใช้
 * ทำให้ใช้ งาน / บันทึกประจำวัน / โน้ต ได้ทันทีโดยไม่ต้องมีทีม และใช้โค้ดชุดเดียวกับทีมทั้งหมด
 */
export async function ensurePersonalSpace(userId: string): Promise<void> {
  if (await prisma.team.findUnique({ where: { personalOfId: userId }, select: { id: true } })) return;
  try {
    await prisma.team.create({
      data: { name: PERSONAL_NAME, personalOfId: userId, members: { create: { userId, access: "OWNER", isLead: true } } },
    });
  } catch (e) {
    // อีก request สร้างไปก่อนพร้อมกัน (personalOfId เป็น unique) — ถือว่าสำเร็จ
    if (!(await prisma.team.findUnique({ where: { personalOfId: userId }, select: { id: true } }))) throw e;
  }
}
