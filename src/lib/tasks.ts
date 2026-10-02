import * as z from "zod";

/** progress = % ที่งานสำเร็จแล้ว (0–100) — ใน todayTasks คือจุดเริ่มต้นของงานที่ยกมาทำต่อ */
/** taskId = อ้างถึงงานที่มอบหมายไว้ (ตาราง Task) — บรรทัดที่พิมพ์เองไม่มี */
export type Task = { text: string; progress?: number; taskId?: string };

const TaskSchema = z
  .object({
    text: z.string().trim().min(1).max(500),
    progress: z.number().int().min(0).max(100).optional(),
    /** รูปแบบเก่า: done = เสร็จ 100% */
    done: z.boolean().optional(),
    taskId: z.string().min(1).max(40).optional(),
  })
  .transform(({ text, progress, done, taskId }): Task => {
    const value = progress ?? (done ? 100 : undefined);
    return { text, ...(value === undefined ? {} : { progress: value }), ...(taskId ? { taskId } : {}) };
  });
export const TaskListSchema = z.array(TaskSchema).max(50);

/** อ่านค่า Json จาก DB แบบปลอดภัย (ข้อมูลเสียจะได้ []) */
export function toTasks(value: unknown): Task[] {
  const parsed = TaskListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export const isDone = (task: Task) => (task.progress ?? 0) >= 100;

/** งานที่วางแผนไว้ครั้งก่อน → ตั้งต้น "ล่าสุดทำอะไรไป" ของวันนี้ (คง % เดิมของงานที่ทำต่อเนื่อง) */
export function carryOver(previousToday: Task[]): Task[] {
  return previousToday.map((t) => ({ text: t.text, progress: t.progress ?? 0, ...(t.taskId ? { taskId: t.taskId } : {}) }));
}

/** % เฉลี่ยของทุก task — null ถ้าไม่มี task */
export function averageProgress(tasks: Task[]): number | null {
  if (tasks.length === 0) return null;
  return Math.round(tasks.reduce((sum, t) => sum + (t.progress ?? 0), 0) / tasks.length);
}
