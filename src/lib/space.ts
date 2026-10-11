import "server-only";
import { cookies } from "next/headers";

/** cookie ที่จำ "พื้นที่ที่กำลังใช้" (ทีมหรือพื้นที่ส่วนตัว) — ตั้งโดยตัวเลือกพื้นที่ใน layout */
export const SPACE_COOKIE = "pace_space";

export const currentSpaceId = async () => (await cookies()).get(SPACE_COOKIE)?.value;

/**
 * เลือกพื้นที่ที่หน้านี้จะแสดง: ?team= ในลิงก์ → พื้นที่ที่เลือกไว้ล่าสุด → รายการแรก
 * (รายการเรียงทีมจริงก่อน พื้นที่ส่วนตัวอยู่ท้าย)
 */
export async function pickSpace<T extends { id: string }>(spaces: T[], param: unknown): Promise<T | undefined> {
  const fromParam = typeof param === "string" ? spaces.find((s) => s.id === param) : undefined;
  if (fromParam) return fromParam;
  const saved = await currentSpaceId();
  return spaces.find((s) => s.id === saved) ?? spaces[0];
}
