"use server";

import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { keyToDate } from "@/lib/dates";
import { TaskFields } from "@/lib/schemas";
import { createTaskFor, editTaskFor, loadTask, revalidateTasks, setDueFor, setProgressFor } from "@/lib/task-ops";
import { addBlockerFor, createLabelFor, removeBlockerFor, setLabelsFor, setParentFor, updateLabelFor } from "@/lib/task-structure";
import { isLabelColor } from "@/lib/labels";
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

type Result = { ok: true } | { ok: false; error: string };

/** ตั้งป้ายของงานใหม่ทั้งชุด */
export async function setTaskLabels(taskId: string, labelIds: string[]): Promise<Result> {
  return setLabelsFor(await requireUser(), String(taskId), Array.isArray(labelIds) ? labelIds.map(String).slice(0, 20) : []);
}

/** สร้างป้ายในทีม (ชื่อซ้ำ = ได้ป้ายเดิม) */
export async function createLabel(teamId: string, name: string, color: string) {
  return createLabelFor(await requireUser(), String(teamId), String(name ?? ""), isLabelColor(color) ? color : "slate");
}

/** แก้ชื่อ/สี หรือลบป้าย (หัวหน้าทีม) */
export async function updateLabel(labelId: string, change: { name?: string; color?: string } | "delete"): Promise<Result> {
  return updateLabelFor(await requireUser(), String(labelId), change === "delete" ? "delete" : { name: change?.name === undefined ? undefined : String(change.name), color: change?.color });
}

/** ย้ายไปเป็นงานย่อยของงานอื่น (null = เลิกเป็นงานย่อย) */
export async function setTaskParent(taskId: string, parentId: string | null): Promise<Result> {
  return setParentFor(await requireUser(), String(taskId), parentId ? String(parentId) : null);
}

/** เพิ่มงานย่อยใต้งานนี้ — ไม่เลือกผู้รับงาน = ผู้รับงานเดียวกับงานแม่ (ถ้ามอบหมายได้) หรือตัวเอง */
export async function createSubtask(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parent = await loadTask(user, String(formData.get("parentId") ?? ""));
  if (!parent) return { error: "ไม่พบงานแม่" };
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "กรุณาระบุชื่องาน" };
  if (title.length > 200) return { error: "ชื่องานยาวเกิน 200 ตัวอักษร" };
  const chosen = String(formData.get("assigneeId") ?? "");
  const assigneeId = chosen || (parent.canManage ? parent.task.assigneeId : user.id);
  const result = await createTaskFor(user, { teamId: parent.task.teamId, assigneeId, title, description: null, dueDate: null, parentId: parent.task.id });
  if (!result.ok) return { error: result.error };
  return { ok: "เพิ่มงานย่อยแล้ว", id: result.task.id };
}

export async function addTaskBlocker(taskId: string, blockerId: string): Promise<Result> {
  return addBlockerFor(await requireUser(), String(taskId), String(blockerId));
}

export async function removeTaskBlocker(taskId: string, blockerId: string): Promise<Result> {
  return removeBlockerFor(await requireUser(), String(taskId), String(blockerId));
}
