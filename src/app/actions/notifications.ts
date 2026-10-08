"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import type { FormState } from "./auth";

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}

/** เปิด/ปิดอีเมลแจ้งเตือนของตัวเอง (กระดิ่งในแอปยังแจ้งเสมอ) */
export async function setEmailNotifications(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const enabled = formData.get("enabled") === "on";
  await prisma.user.update({ where: { id: user.id }, data: { emailNotifications: enabled } });
  revalidatePath("/account");
  return { ok: enabled ? "เปิดอีเมลแจ้งเตือนแล้ว" : "ปิดอีเมลแจ้งเตือนแล้ว" };
}
