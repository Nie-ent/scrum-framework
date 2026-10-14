"use server";

import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { keyToDate } from "@/lib/dates";
import { TaskFields } from "@/lib/schemas";
import { createTaskFor, editTaskFor, loadTask, revalidateTasks, setDueFor, setProgressFor } from "@/lib/task-ops";
import type { FormState } from "./auth";

// กฎของช่องกรอกใช้ร่วมกับฟอร์มฝั่งเบราว์เซอร์ (src/lib/schemas.ts) — ที่นี่แปลงเป็นค่าที่จะบันทึก
const TaskSchema = TaskFields.extend({ teamId: z.string().min(1) }).transform((d) => ({
  ...d,
  description: d.description || null,
  dueDate: d.dueDate ? keyToDate(d.dueDate) : null,
}));

const done = revalidateTasks;

/** หัวหน้าทีมมอบหมายให้สมาชิกในทีมได้ทุกคน — สมาชิกทั่วไปสร้างได้เฉพาะงานของตัวเอง (กฎอยู่ใน lib/task-ops) */
export async function createTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = TaskSchema.safeParse({
    teamId: formData.get("teamId") ?? "",
    assigneeId: formData.get("assigneeId") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const result = await createTaskFor(user, parsed.data);
  if (!result.ok) return { error: result.error };
  return { ok: result.self ? "เพิ่มงานแล้ว" : "มอบหมายงานแล้ว", id: result.task.id };
}

/** คนรับงานหรือหัวหน้าทีมอัปเดต % ได้ พร้อมเหตุผล (ไม่บังคับ) */
export async function setTaskProgress(formData: FormData) {
  const user = await requireUser();
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  await setProgressFor(user, String(formData.get("id")), Math.round(Number(formData.get("progress"))), reason);
}

/** ลบได้: หัวหน้าทีม หรือเจ้าของงานที่สร้างให้ตัวเอง */
async function canDelete(user: CurrentUser, id: string, includeDeleted = false) {
  const found = await loadTask(user, id, includeDeleted);
  if (!found) return null;
  const ownTask = found.isAssignee && found.task.createdById === user.id;
  return found.canManage || ownTask ? found.task : null;
}

/** ลบแบบซ่อนไว้ (deletedAt) เพื่อให้กดเลิกทำได้ */
export async function deleteTask(formData: FormData): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const task = await canDelete(user, String(formData.get("id")));
  if (!task) return { ok: false };
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: new Date() } });
  done();
  return { ok: true };
}

/** เลิกทำการลบ — คืนได้ภายใน 1 วันหลังลบ */
export async function restoreTask(formData: FormData): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const task = await canDelete(user, String(formData.get("id")), true);
  if (!task?.deletedAt || Date.now() - task.deletedAt.getTime() > 24 * 60 * 60 * 1000) return { ok: false };
  await prisma.task.update({ where: { id: task.id }, data: { deletedAt: null } });
  done();
  return { ok: true };
}

/** แก้ชื่อ รายละเอียด และ/หรือโอนผู้รับงาน (กฎสิทธิ์อยู่ใน lib/task-ops) — ไม่ส่ง assigneeId = ไม่โอน */
export async function editTask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const assigneeId = formData.get("assigneeId");
  const result = await editTaskFor(user, String(formData.get("id")), {
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    assigneeId: typeof assigneeId === "string" && assigneeId ? assigneeId : undefined,
  });
  if (!result.ok) return { error: result.error };
  return { ok: "บันทึกแล้ว" };
}

/** กำหนด/เลื่อน/ล้างวันกำหนดส่งของงาน — คนรับงานหรือคนที่ดูแลทีม (ใช้จากหน้า ปฏิทิน) */
export async function setTaskDue(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = String(formData.get("dueDate") ?? "");
  const result = await setDueFor(user, String(formData.get("id")), raw);
  if (!result.ok) return { error: result.error };
  return { ok: raw ? "บันทึกวันแล้ว" : "เอากำหนดส่งออกแล้ว" };
}
