"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { isDateKey, keyToDate, todayKey } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { TaskFields } from "@/lib/schemas";
import { nextTaskNumbers } from "@/lib/task-store";
import { toTasks } from "@/lib/tasks";
import { getManageableTeamIds } from "@/lib/teams";
import type { FormState } from "./auth";

// กฎของช่องกรอกใช้ร่วมกับฟอร์มฝั่งเบราว์เซอร์ (src/lib/schemas.ts) — ที่นี่แปลงเป็นค่าที่จะบันทึก
const TaskSchema = TaskFields.extend({ teamId: z.string().min(1) }).transform((d) => ({
  ...d,
  description: d.description || null,
  dueDate: d.dueDate ? keyToDate(d.dueDate) : null,
}));

function done() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
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
    include: { team: { select: { name: true } }, user: { select: { active: true } } },
  });
  if (!assignee || !assignee.participates || !assignee.user.active) return { error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };

  const [number] = await nextTaskNumbers(data.teamId);
  const task = await prisma.task.create({ data: { ...data, number, createdById: user.id } });

  if (data.assigneeId !== user.id) {
    await notify([{ userId: data.assigneeId }], (tr) => ({
      title: tr("งานใหม่จาก {0}", [user.name]),
      body: tr("{0} · ทีม {1}", [data.title, assignee.team.name]),
      // เปิดแล้วเห็นงานนี้เลย ไม่ต้องหาในรายการ
      url: `/tasks?team=${data.teamId}&task=${number}`,
    }));
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

/**
 * คนรับงานหรือหัวหน้าทีมอัปเดต % ได้ พร้อมเหตุผล (ไม่บังคับ)
 * ทุกครั้งที่ % เปลี่ยนจะบันทึกลงเธรดความคิดเห็นของงาน และแจ้งผู้เกี่ยวข้อง
 */
export async function setTaskProgress(formData: FormData) {
  const user = await requireUser();
  const found = await loadTask(user, String(formData.get("id")));
  const progress = Math.round(Number(formData.get("progress")));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500);
  if (!found || !(found.canManage || found.isAssignee)) return;
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return;
  const { task } = found;
  // % เท่าเดิมและไม่มีเหตุผล = ไม่มีอะไรเปลี่ยน
  if (progress === task.progress && !reason) return;

  // เช็กอินของวันนี้ที่อ้างถึงงานนี้ แสดง % เดียวกับงาน (เช็กอินวันก่อน ๆ คงไว้เป็นประวัติ)
  const checkin = await prisma.standup.findUnique({
    where: { userId_teamId_date: { userId: task.assigneeId, teamId: task.teamId, date: keyToDate(todayKey()) } },
    select: { id: true, yesterdayTasks: true, todayTasks: true },
  });
  const withProgress = (value: unknown) => toTasks(value).map((t) => (t.taskId === task.id ? { ...t, progress } : t));
  const inCheckin = checkin && [...toTasks(checkin.yesterdayTasks), ...toTasks(checkin.todayTasks)].some((t) => t.taskId === task.id);

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { progress, doneAt: progress >= 100 ? (task.doneAt ?? new Date()) : null },
    }),
    prisma.comment.create({
      data: { taskId: task.id, authorId: user.id, body: reason, progressFrom: task.progress, progressTo: progress },
    }),
    ...(inCheckin
      ? [
          prisma.standup.update({
            where: { id: checkin.id },
            data: { yesterdayTasks: withProgress(checkin.yesterdayTasks), todayTasks: withProgress(checkin.todayTasks) },
          }),
        ]
      : []),
  ]);
  await notifyProgress(user, task, progress, reason);
  done();
}

/** ผู้เกี่ยวข้องกับงาน: คนรับงาน คนมอบหมาย และหัวหน้า/เจ้าของทีมของงานนั้นและของทีมแม่ (ไม่รวมคนที่อัปเดตเอง) */
async function notifyProgress(
  actor: CurrentUser,
  task: { id: string; teamId: string; assigneeId: string; createdById: string | null; title: string; progress: number; number: number | null },
  progress: number,
  reason: string,
) {
  // หัวหน้า/เจ้าของของทีมแม่ดูแลทีมย่อยด้วย จึงได้รับแจ้งเช่นกัน
  const team = await prisma.team.findUnique({ where: { id: task.teamId }, select: { parentId: true } });
  const leads = await prisma.teamMember.findMany({
    where: { teamId: { in: [task.teamId, ...(team?.parentId ? [team.parentId] : [])] }, access: { not: "MEMBER" }, user: { active: true } },
    select: { userId: true },
  });
  const ids = new Set([task.assigneeId, ...(task.createdById ? [task.createdById] : []), ...leads.map((m) => m.userId)]);
  ids.delete(actor.id);
  const change = progress === task.progress ? `${progress}%` : `${task.progress}% → ${progress}%`;
  await notify(
    [...ids].map((userId) => ({ userId })),
    (tr) => ({
      title: progress >= 100 && task.progress < 100 ? tr("{0} ทำงานเสร็จแล้ว", [actor.name]) : tr("{0} อัปเดตความคืบหน้า {1}", [actor.name, change]),
      body: `${task.title}${reason ? ` — ${reason}` : ""}`,
      url: `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`,
    }),
    // อัปเดต % เกิดบ่อย: แจ้งในแอปและ push เท่านั้น ไม่ส่งอีเมล
    { email: false },
  );
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

/** กำหนด/เลื่อน/ล้างวันกำหนดส่งของงาน — คนรับงานหรือคนที่ดูแลทีม (ใช้จากหน้า ปฏิทิน) */
export async function setTaskDue(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadTask(user, String(formData.get("id")));
  if (!found || !(found.canManage || found.isAssignee)) return { error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  const raw = String(formData.get("dueDate") ?? "");
  if (raw !== "" && !isDateKey(raw)) return { error: "วันที่ไม่ถูกต้อง" };
  await prisma.task.update({ where: { id: found.task.id }, data: { dueDate: raw ? keyToDate(raw) : null } });
  done();
  revalidatePath("/calendar");
  return { ok: raw ? "บันทึกวันแล้ว" : "เอากำหนดส่งออกแล้ว" };
}
