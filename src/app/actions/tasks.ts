"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { isDateKey, keyToDate } from "@/lib/dates";
import { sendPush } from "@/lib/push";
import { getManageableTeamIds } from "@/lib/teams";
import type { FormState } from "./auth";

const TaskSchema = z.object({
  teamId: z.string().min(1),
  assigneeId: z.string().min(1),
  title: z.string().trim().min(1, { error: "กรุณาระบุชื่องาน" }).max(200),
  description: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => v || null),
  dueDate: z
    .string()
    .refine((v) => v === "" || isDateKey(v), { error: "วันที่ไม่ถูกต้อง" })
    .transform((v) => (v ? keyToDate(v) : null)),
});

function done() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
}

/** หัวหน้าทีมมอบหมายให้สมาชิกในทีมได้ทุกคน — สมาชิกทั่วไปสร้างได้เฉพาะงานของตัวเอง */
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
  const data = parsed.data;

  const canManage = (await getManageableTeamIds(user)).has(data.teamId);
  const isMember = user.memberships.some((m) => m.teamId === data.teamId);
  if (!canManage && !(isMember && data.assigneeId === user.id)) {
    return { error: "มอบหมายงานให้คนอื่นได้เฉพาะหัวหน้าทีม" };
  }
  const assignee = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: data.assigneeId, teamId: data.teamId } },
    include: { team: { select: { name: true } }, user: { select: { active: true, pushSubs: true } } },
  });
  if (!assignee || !assignee.participates || !assignee.user.active) return { error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };

  const task = await prisma.task.create({ data: { ...data, createdById: user.id } });

  // แจ้งคนรับงาน (ถ้าเปิดแจ้งเตือนไว้) — ไม่ให้การแจ้งเตือนที่ล้มเหลวทำให้การมอบหมายพัง
  if (data.assigneeId !== user.id) {
    await sendPush(assignee.user.pushSubs, {
      title: `งานใหม่จาก ${user.name}`,
      body: `${data.title} · ทีม ${assignee.team.name}`,
      url: `/tasks?team=${data.teamId}`,
    }).catch(() => undefined);
  }
  done();
  return { ok: data.assigneeId === user.id ? "เพิ่มงานแล้ว" : "มอบหมายงานแล้ว", id: task.id };
}

/** includeDeleted = ใช้ตอนกดเลิกทำ (ปกติงานที่ลบแล้วถือว่าไม่มี) */
async function loadTask(user: CurrentUser, id: string, includeDeleted = false) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || (task.deletedAt && !includeDeleted)) return null;
  const canManage = (await getManageableTeamIds(user)).has(task.teamId);
  return { task, canManage, isAssignee: task.assigneeId === user.id };
}

/** คนรับงานหรือหัวหน้าทีมอัปเดต % ได้ */
export async function setTaskProgress(formData: FormData) {
  const user = await requireUser();
  const found = await loadTask(user, String(formData.get("id")));
  const progress = Math.round(Number(formData.get("progress")));
  if (!found || !(found.canManage || found.isAssignee)) return;
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return;
  await prisma.task.update({
    where: { id: found.task.id },
    data: { progress, doneAt: progress >= 100 ? (found.task.doneAt ?? new Date()) : null },
  });
  done();
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
