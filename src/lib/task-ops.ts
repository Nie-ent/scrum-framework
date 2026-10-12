import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { isDateKey, keyToDate, todayKey } from "./dates";
import { notify } from "./notify";
import { nextTaskNumbers } from "./task-store";
import { toTasks } from "./tasks";
import { getManageableTeamIds } from "./teams";

/**
 * การเปลี่ยนแปลงงานที่ใช้ร่วมกันทั้งจากหน้าเว็บ (server action) และจากผู้ช่วย AI (MCP)
 * — กฎสิทธิ์ การแจ้งเตือน และการซิงก์กับเช็กอินจึงเหมือนกันทุกทาง
 * ข้อความ error เป็นภาษาไทย (ใช้เป็น key แปลตอนแสดงผล)
 */
export type OpResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export function revalidateTasks() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
  revalidatePath("/dashboard");
  revalidatePath("/calendar");
}

/** หัวหน้าทีมมอบหมายให้สมาชิกในทีมได้ทุกคน — สมาชิกทั่วไปสร้างได้เฉพาะงานของตัวเอง */
export async function createTaskFor(
  user: CurrentUser,
  data: { teamId: string; assigneeId: string; title: string; description: string | null; dueDate: Date | null },
): Promise<OpResult<{ task: { id: string; number: number }; self: boolean }>> {
  const canManage = (await getManageableTeamIds(user)).has(data.teamId);
  const isMember = user.memberships.some((m) => m.teamId === data.teamId);
  if (!canManage && !(isMember && data.assigneeId === user.id)) {
    return { ok: false, error: "มอบหมายงานให้คนอื่นได้เฉพาะหัวหน้าทีม" };
  }
  const assignee = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: data.assigneeId, teamId: data.teamId } },
    include: { team: { select: { name: true } }, user: { select: { active: true } } },
  });
  if (!assignee || !assignee.participates || !assignee.user.active) return { ok: false, error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };

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
  revalidateTasks();
  return { ok: true, task: { id: task.id, number }, self: data.assigneeId === user.id };
}

/** includeDeleted = ใช้ตอนกดเลิกทำ (ปกติงานที่ลบแล้วถือว่าไม่มี) */
export async function loadTask(user: CurrentUser, id: string, includeDeleted = false) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task || (task.deletedAt && !includeDeleted)) return null;
  const canManage = (await getManageableTeamIds(user)).has(task.teamId);
  return { task, canManage, isAssignee: task.assigneeId === user.id };
}

/**
 * คนรับงานหรือหัวหน้าทีมอัปเดต % ได้ พร้อมเหตุผล (ไม่บังคับ)
 * ทุกครั้งที่ % เปลี่ยนจะบันทึกลงเธรดความคิดเห็นของงาน และแจ้งผู้เกี่ยวข้อง
 */
export async function setProgressFor(user: CurrentUser, taskId: string, progress: number, reason: string): Promise<OpResult> {
  const found = await loadTask(user, taskId);
  if (!found || !(found.canManage || found.isAssignee)) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return { ok: false, error: "ความคืบหน้าต้องอยู่ระหว่าง 0 ถึง 100" };
  const { task } = found;
  // % เท่าเดิมและไม่มีเหตุผล = ไม่มีอะไรเปลี่ยน
  if (progress === task.progress && !reason) return { ok: true };

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
  revalidateTasks();
  return { ok: true };
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

/** กำหนด/เลื่อน/ล้างวันกำหนดส่งของงาน ("" = ไม่มีกำหนด) — คนรับงานหรือคนที่ดูแลทีม */
export async function setDueFor(user: CurrentUser, taskId: string, raw: string): Promise<OpResult> {
  const found = await loadTask(user, taskId);
  if (!found || !(found.canManage || found.isAssignee)) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  if (raw !== "" && !isDateKey(raw)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  await prisma.task.update({ where: { id: found.task.id }, data: { dueDate: raw ? keyToDate(raw) : null } });
  revalidateTasks();
  return { ok: true };
}
