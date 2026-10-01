"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { keyToDate, todayKey } from "@/lib/dates";
import { TaskListSchema } from "@/lib/tasks";
import type { FormState } from "./auth";

const optional = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => v || null);

const tasksJson = (requiredMessage: string) =>
  z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "รูปแบบ task ไม่ถูกต้อง" });
        return z.NEVER;
      }
    })
    .pipe(TaskListSchema.min(1, { error: requiredMessage }));

const StandupSchema = z.object({
  teamId: z.string().min(1, { error: "กรุณาเลือกทีม" }),
  yesterdayTasks: tasksJson("กรุณาใส่อย่างน้อย 1 task ใน \"ล่าสุดทำอะไรไป\""),
  todayTasks: tasksJson("กรุณาใส่อย่างน้อย 1 task ใน \"วันนี้จะทำอะไร\""),
  blockers: optional,
  notWorking: optional,
  workingWell: optional,
});

export async function saveStandup(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = StandupSchema.safeParse({
    teamId: formData.get("teamId") ?? "",
    yesterdayTasks: formData.get("yesterdayTasks") ?? "[]",
    todayTasks: formData.get("todayTasks") ?? "[]",
    blockers: formData.get("blockers") ?? "",
    notWorking: formData.get("notWorking") ?? "",
    workingWell: formData.get("workingWell") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { teamId, ...data } = parsed.data;

  // ส่งได้เฉพาะทีมที่ตัวเองเป็นสมาชิก
  if (!user.memberships.some((m) => m.teamId === teamId)) return { error: "คุณไม่ได้อยู่ในทีมนี้" };

  // บันทึกได้เฉพาะของวันนี้ (ตาม APP_TIMEZONE) ส่งซ้ำ = แก้ไข
  const date = keyToDate(todayKey());
  await prisma.standup.upsert({
    where: { userId_teamId_date: { userId: user.id, teamId, date } },
    create: { userId: user.id, teamId, date, ...data },
    update: data,
  });

  revalidatePath("/standup");
  revalidatePath("/dashboard");
  return { ok: "บันทึก daily scrum ของวันนี้แล้ว" };
}
