import "server-only";
import { prisma } from "./db";

/**
 * จองเลขงานถัดไปของทีม `count` เลข (เช่น #12, #13) — ใช้ UPDATE คำสั่งเดียวจึงไม่ชนกันแม้สร้างพร้อมกัน
 * เลขที่จองแล้วแต่สร้างงานไม่สำเร็จจะถูกข้ามไป (เลขไม่จำเป็นต้องต่อเนื่อง)
 */
export async function nextTaskNumbers(teamId: string, count = 1): Promise<number[]> {
  if (count <= 0) return [];
  const rows = await prisma.$queryRaw<{ taskSeq: number }[]>`
    UPDATE "Team" SET "taskSeq" = "taskSeq" + ${count} WHERE "id" = ${teamId} RETURNING "taskSeq"`;
  const last = rows[0]?.taskSeq;
  if (last === undefined) throw new Error("team not found");
  return Array.from({ length: count }, (_, i) => last - count + 1 + i);
}
