import * as z from "zod";

export type Task = { text: string; done?: boolean };

const TaskSchema = z.object({
  text: z.string().trim().min(1).max(500),
  done: z.boolean().optional(),
});
export const TaskListSchema = z.array(TaskSchema).max(50);

/** อ่านค่า Json จาก DB แบบปลอดภัย (ข้อมูลเสียจะได้ []) */
export function toTasks(value: unknown): Task[] {
  const parsed = TaskListSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** งานที่วางแผนไว้ครั้งก่อน → ตั้งต้น "ล่าสุดทำอะไรไป" ของวันนี้ (ยังไม่ติ๊ก) */
export function carryOver(previousToday: Task[]): Task[] {
  return previousToday.map((t) => ({ text: t.text, done: false }));
}
