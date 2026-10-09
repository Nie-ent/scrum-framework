"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { keyToDate, todayKey } from "@/lib/dates";
import { TaskListSchema, toTasks, type Task } from "@/lib/tasks";
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
  if (!user.memberships.some((m) => m.teamId === teamId && m.participates)) return { error: "คุณไม่ได้อยู่ในทีมนี้" };

  // บันทึกได้เฉพาะของวันนี้ (ตาม APP_TIMEZONE) ส่งซ้ำ = แก้ไข
  const date = keyToDate(todayKey());
  // บรรทัดที่อ้างถึงงานที่มอบหมาย: ใช้ได้เฉพาะงานของตัวเองในทีมนี้ (กันการส่ง taskId ของคนอื่นมา)
  const linkedIds = [...data.yesterdayTasks, ...data.todayTasks].flatMap((t) => (t.taskId ? [t.taskId] : []));
  const linked =
    linkedIds.length === 0
      ? []
      : await prisma.task.findMany({
          where: { id: { in: linkedIds }, assigneeId: user.id, teamId, deletedAt: null },
          select: { id: true, progress: true },
        });
  const owned = new Set(linked.map((t) => t.id));
  const before = new Map(linked.map((t) => [t.id, t.progress]));
  const keepOwned = (tasks: Task[]): Task[] =>
    tasks.map(({ taskId, ...rest }) => (taskId && owned.has(taskId) ? { ...rest, taskId } : rest));
  // เช็กอินของวันนี้ที่เคยส่งไว้ — ใช้ดูว่า % ของงานบรรทัดไหน "ถูกแก้ในเช็กอินจริง ๆ"
  const existing = await prisma.standup.findUnique({
    where: { userId_teamId_date: { userId: user.id, teamId, date } },
    select: { yesterdayTasks: true },
  });
  const savedProgress = new Map(toTasks(existing?.yesterdayTasks).flatMap((t) => (t.taskId ? [[t.taskId, t.progress ?? 0] as const] : [])));

  // งานที่ % ในฟอร์มเท่ากับที่เคยบันทึกไว้ในเช็กอิน = ผู้ใช้ไม่ได้แตะ → ไม่เขียนทับงาน
  // (กันกรณีอัปเดต % จากหน้า งาน ไปแล้ว แล้วมาแก้ส่วนอื่นของเช็กอิน % จะไม่ถูกดึงกลับเป็นค่าเก่า)
  // และปรับ % ในเช็กอินให้ตรงกับงานแทน
  const untouched = new Map<string, number>();
  const changed: { taskId: string; from: number; to: number }[] = [];
  const yesterdayTasks = keepOwned(data.yesterdayTasks).map((t) => {
    if (!t.taskId) return t;
    const submitted = t.progress ?? 0;
    const current = before.get(t.taskId) ?? submitted;
    if (savedProgress.get(t.taskId) === submitted) {
      untouched.set(t.taskId, current);
      return { ...t, progress: current };
    }
    if (current !== submitted) changed.push({ taskId: t.taskId, from: current, to: submitted });
    return t;
  });
  // "วันนี้จะทำอะไร" ของงานเดียวกันเริ่มจาก % ล่าสุดของงานเช่นกัน
  const todayTasks = keepOwned(data.todayTasks).map((t) =>
    t.taskId && untouched.has(t.taskId) ? { ...t, progress: untouched.get(t.taskId)! } : t,
  );

  await prisma.$transaction([
    prisma.standup.upsert({
      where: { userId_teamId_date: { userId: user.id, teamId, date } },
      create: { userId: user.id, teamId, date, ...data, yesterdayTasks, todayTasks },
      update: { ...data, yesterdayTasks, todayTasks },
    }),
    // % ที่แก้ใน "ล่าสุดทำอะไรไป" ไหลกลับไปที่งานที่มอบหมาย และบันทึกลงเธรดของงาน
    // (ไม่แจ้งเตือนซ้ำ หัวหน้าเห็นจากเช็กอินอยู่แล้ว)
    ...changed.flatMap((c) => [
      prisma.task.update({
        where: { id: c.taskId },
        data: { progress: c.to, ...(c.to >= 100 ? (c.from >= 100 ? {} : { doneAt: new Date() }) : { doneAt: null }) },
      }),
      prisma.comment.create({ data: { taskId: c.taskId, authorId: user.id, body: "อัปเดตจากเช็กอิน", progressFrom: c.from, progressTo: c.to } }),
    ]),
  ]);

  revalidatePath("/standup");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  return { ok: "บันทึก daily scrum ของวันนี้แล้ว" };
}
