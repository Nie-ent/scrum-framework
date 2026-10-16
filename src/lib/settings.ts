import "server-only";
import { cache } from "react";
import { prisma } from "./db";

/**
 * ค่าตั้งของระบบที่ผู้ดูแลปรับได้ที่หน้า จัดการระบบ → ชำระเงิน (เก็บในตาราง AppSetting ไม่ต้อง deploy)
 * ไม่มีแถว = ใช้ค่าเริ่มต้นด้านล่าง
 */
export type AppSettings = {
  /** แพ็กเกจฟรีใช้ได้กี่คนต่อ workspace */
  freeSeats: number;
  /** ใครก็สมัครเองได้ (ปิด = สมัครได้เฉพาะคนที่มีลิงก์คำเชิญ) */
  allowSignup: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
  freeSeats: 5,
  // ค่าเริ่มต้นจาก env เดิม เผื่อเว็บที่ตั้ง ALLOW_SIGNUP=false ไว้แล้ว
  allowSignup: process.env.ALLOW_SIGNUP !== "false",
};

const valid: { [K in keyof AppSettings]: (v: unknown) => v is AppSettings[K] } = {
  freeSeats: (v): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10000,
  allowSignup: (v): v is boolean => typeof v === "boolean",
};

/** อ่านครั้งเดียวต่อ request */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await prisma.appSetting.findMany();
  const settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key in valid && valid[key as keyof AppSettings](value)) Object.assign(settings, { [key]: value });
  }
  return settings;
});

export async function saveSettings(patch: Partial<AppSettings>) {
  await prisma.$transaction(
    Object.entries(patch).map(([key, value]) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })),
  );
}
