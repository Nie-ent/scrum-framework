"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { keyToDate, todayKey } from "@/lib/dates";
import type { FormState } from "./auth";

const optional = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => v || null);

const StandupSchema = z.object({
  yesterday: z.string().trim().min(1, { error: "กรุณากรอกว่าล่าสุดทำอะไรไป" }).max(4000),
  today: z.string().trim().min(1, { error: "กรุณากรอกว่าวันนี้จะทำอะไร" }).max(4000),
  blockers: optional,
  notWorking: optional,
  workingWell: optional,
});

export async function saveStandup(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = StandupSchema.safeParse({
    yesterday: formData.get("yesterday") ?? "",
    today: formData.get("today") ?? "",
    blockers: formData.get("blockers") ?? "",
    notWorking: formData.get("notWorking") ?? "",
    workingWell: formData.get("workingWell") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // บันทึกได้เฉพาะของวันนี้ (ตาม APP_TIMEZONE) ส่งซ้ำ = แก้ไข
  const date = keyToDate(todayKey());
  await prisma.standup.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, ...parsed.data },
    update: parsed.data,
  });

  revalidatePath("/standup");
  revalidatePath("/dashboard");
  return { ok: "บันทึก daily scrum ของวันนี้แล้ว" };
}
