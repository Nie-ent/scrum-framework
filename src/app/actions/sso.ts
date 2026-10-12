"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/** ยกเลิกการผูกบัญชี Google/Microsoft ของตัวเอง — ยังเข้าสู่ระบบด้วยรหัสผ่านได้ */
export async function unlinkIdentity(formData: FormData) {
  const user = await requireUser();
  await prisma.userIdentity.deleteMany({ where: { userId: user.id, provider: String(formData.get("provider") ?? "") } });
  revalidatePath("/account");
}
