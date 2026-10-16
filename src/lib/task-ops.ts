import "server-only";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey, isDateKey, keyToDate, todayKey } from "./dates";
import { notify } from "./notify";
import { nextTaskNumbers } from "./task-store";
import { isPostpone, toTasks } from "./tasks";
import { getManageableTeamIds } from "./teams";
import { trFor } from "./i18n/server";
import { syncRefs } from "./refs";
import { alertDueMoved, alertUnblocked, checkNewParent } from "./task-structure";

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
  data: { teamId: string; assigneeId: string; title: string; description: string | null; dueDate: Date | null; parentId?: string | null },
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
  if (data.parentId) {
    const problem = await checkNewParent(data.teamId, data.parentId);
    if (problem) return { ok: false, error: problem };
  }

  const [number] = await nextTaskNumbers(data.teamId);
  const task = await prisma.task.create({ data: { ...data, parentId: data.parentId ?? null, number, createdById: user.id } });
  if (data.description) await syncTaskRefs(user, task);

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

export const MAX_BATCH = 50;
type NewTask = { assigneeId: string; title: string; description: string | null; dueDate: Date | null; parentId?: string | null };

/**
 * สร้างหลายงานในพื้นที่เดียวครั้งเดียว (ใช้จาก MCP) — ตรวจทุกงานก่อน ผิดข้อเดียว = ไม่สร้างเลยทั้งชุด
 * กฎสิทธิ์เดียวกับ createTaskFor · ผู้รับงานแต่ละคนได้แจ้งเตือนครั้งเดียวรวมทุกงานของตัวเอง
 */
export async function createTasksFor(user: CurrentUser, teamId: string, items: NewTask[]): Promise<OpResult<{ tasks: { number: number; title: string }[] }>> {
  if (items.length === 0 || items.length > MAX_BATCH) return { ok: false, error: "สร้างได้ครั้งละ 1–50 งาน" };
  const canManage = (await getManageableTeamIds(user)).has(teamId);
  const isMember = user.memberships.some((m) => m.teamId === teamId);
  if (!canManage && !(isMember && items.every((t) => t.assigneeId === user.id))) return { ok: false, error: "มอบหมายงานให้คนอื่นได้เฉพาะหัวหน้าทีม" };
  const ids = [...new Set(items.map((t) => t.assigneeId))];
  const members = await prisma.teamMember.findMany({
    where: { teamId, userId: { in: ids }, participates: true, user: { active: true } },
    select: { userId: true, team: { select: { name: true } } },
  });
  if (members.length !== ids.length) return { ok: false, error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };
  for (const parentId of new Set(items.flatMap((t) => t.parentId ?? []))) {
    const problem = await checkNewParent(teamId, parentId);
    if (problem) return { ok: false, error: problem };
  }

  const numbers = await nextTaskNumbers(teamId, items.length);
  const created = await prisma.$transaction(items.map((t, i) => prisma.task.create({ data: { ...t, parentId: t.parentId ?? null, teamId, number: numbers[i], createdById: user.id } })));
  for (const task of created) if (task.description) await syncTaskRefs(user, task);

  const teamName = members[0].team.name;
  const others = ids.filter((id) => id !== user.id);
  for (const assigneeId of others) {
    const mine = items.map((t, i) => ({ ...t, number: numbers[i] })).filter((t) => t.assigneeId === assigneeId);
    await notify([{ userId: assigneeId }], (tr) => ({
      title: mine.length === 1 ? tr("งานใหม่จาก {0}", [user.name]) : tr("งานใหม่ {0} งานจาก {1}", [mine.length, user.name]),
      body: tr("{0} · ทีม {1}", [mine.map((t) => `#${t.number} ${t.title}`).join(", "), teamName]),
      url: mine.length === 1 ? `/tasks?team=${teamId}&task=${mine[0].number}` : `/tasks?team=${teamId}&who=${assigneeId}`,
    }));
  }
  revalidateTasks();
  return { ok: true, tasks: items.map((t, i) => ({ number: numbers[i], title: t.title })) };
}

/**
 * มอบงานเดียวกันให้หลายคน: สร้างงานแม่ 1 งาน + งานย่อยคนละ 1 งาน (แต่ละคนมี % ของตัวเอง ขึ้นในเช็กอินและสถิติของคนนั้น)
 * งานแม่เป็นของคนมอบหมาย (ถ้าอยู่ในทีมและร่วมเช็กอิน ไม่งั้นเป็นของคนแรกที่ถูกแท็ก) และปิดเองเมื่องานย่อยเสร็จครบ
 */
export async function createGroupTaskFor(
  user: CurrentUser,
  data: { teamId: string; assigneeIds: string[]; title: string; description: string | null; dueDate: Date | null },
): Promise<OpResult<{ task: { id: string; number: number }; subtasks: number[] }>> {
  const ids = [...new Set(data.assigneeIds)];
  if (ids.length < 2) return { ok: false, error: "เลือกผู้รับงานอย่างน้อย 2 คน" };
  if (ids.length > MAX_BATCH) return { ok: false, error: "มอบหมายได้ครั้งละไม่เกิน 50 คน" };
  // ตรวจสิทธิ์และผู้รับงานทุกคนก่อนสร้างอะไร
  if (!(await getManageableTeamIds(user)).has(data.teamId)) return { ok: false, error: "มอบหมายงานให้คนอื่นได้เฉพาะหัวหน้าทีม" };
  const members = await prisma.teamMember.findMany({
    where: { teamId: data.teamId, userId: { in: [...ids, user.id] }, participates: true, user: { active: true } },
    select: { userId: true },
  });
  const ok = new Set(members.map((m) => m.userId));
  if (!ids.every((id) => ok.has(id))) return { ok: false, error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };
  const owner = ok.has(user.id) ? user.id : ids[0];

  const { teamId, title, description, dueDate } = data;
  const parent = await createTaskFor(user, { teamId, assigneeId: owner, title, description, dueDate });
  if (!parent.ok) return parent;
  const children = await createTasksFor(user, teamId, ids.map((assigneeId) => ({ assigneeId, title, description: null, dueDate, parentId: parent.task.id })));
  if (!children.ok) {
    await prisma.task.delete({ where: { id: parent.task.id } });
    return children;
  }
  return { ok: true, task: parent.task, subtasks: children.tasks.map((t) => t.number) };
}

/**
 * แก้ชื่อ/รายละเอียด และโอนผู้รับงาน
 * - ชื่อและรายละเอียด: หัวหน้าทีม ผู้รับงาน หรือคนสร้างงาน
 * - โอนงาน: หัวหน้าทีม หรือคนที่มอบหมายงานนี้ให้คนอื่นไว้ — ผู้รับงานโอนเองไม่ได้
 *   (สมาชิกทั่วไปที่สร้างงานให้ตัวเองโอนไม่ได้ เพราะเท่ากับมอบหมายงานให้คนอื่น ซึ่งทำได้เฉพาะหัวหน้า)
 * การโอนบันทึกลงเธรดของงาน และแจ้งทั้งคนรับงานใหม่และคนเดิม
 */
export async function editTaskFor(
  user: CurrentUser,
  taskId: string,
  changes: { title?: string; description?: string | null; assigneeId?: string },
): Promise<OpResult> {
  const found = await loadTask(user, taskId);
  if (!found) return { ok: false, error: "ไม่พบงานนี้" };
  const { task, canManage, isAssignee } = found;
  const isCreator = task.createdById === user.id;
  const title = changes.title?.trim();
  const description = changes.description === undefined ? undefined : changes.description?.trim() || null;
  const textChanged = (title !== undefined && title !== task.title) || (description !== undefined && description !== task.description);
  const moving = changes.assigneeId !== undefined && changes.assigneeId !== task.assigneeId;
  if (!textChanged && !moving) return { ok: true };

  if (textChanged && !(canManage || isAssignee || isCreator)) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  if (title !== undefined && !title) return { ok: false, error: "กรุณาระบุชื่องาน" };
  if (title && title.length > 200) return { ok: false, error: "ชื่องานยาวเกิน 200 ตัวอักษร" };
  if (description && description.length > 2000) return { ok: false, error: "รายละเอียดยาวเกิน 2,000 ตัวอักษร" };

  let target: { userId: string; user: { name: string }; team: { name: string } } | null = null;
  if (moving) {
    if (!(canManage || (isCreator && task.createdById !== task.assigneeId))) return { ok: false, error: "โอนงานได้เฉพาะหัวหน้าทีมหรือคนที่มอบหมายงานนี้" };
    target = await prisma.teamMember.findFirst({
      where: { teamId: task.teamId, userId: changes.assigneeId, participates: true, user: { active: true } },
      select: { userId: true, user: { select: { name: true } }, team: { select: { name: true } } },
    });
    if (!target) return { ok: false, error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" };
  }

  const newTitle = title ?? task.title;
  const from = moving ? await prisma.user.findUnique({ where: { id: task.assigneeId }, select: { name: true } }) : null;
  // ชื่องานในเช็กอินวันนี้ของผู้รับงานเปลี่ยนตาม (เช็กอินวันก่อน ๆ คงไว้เป็นประวัติ)
  const checkin = title !== undefined && title !== task.title
    ? await prisma.standup.findUnique({
        where: { userId_teamId_date: { userId: task.assigneeId, teamId: task.teamId, date: keyToDate(todayKey()) } },
        select: { id: true, yesterdayTasks: true, todayTasks: true },
      })
    : null;
  const renamed = (value: unknown) => toTasks(value).map((t) => (t.taskId === task.id ? { ...t, text: newTitle } : t));
  const inCheckin = checkin && [...toTasks(checkin.yesterdayTasks), ...toTasks(checkin.todayTasks)].some((t) => t.taskId === task.id);

  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { ...(title !== undefined ? { title } : {}), ...(description !== undefined ? { description } : {}), ...(target ? { assigneeId: target.userId } : {}) },
    }),
    ...(target
      ? [prisma.comment.create({ data: { taskId: task.id, authorId: user.id, body: trFor(user.locale)("โอนงานจาก {0} ให้ {1}", [from?.name ?? "—", target.user.name]) } })]
      : []),
    ...(inCheckin ? [prisma.standup.update({ where: { id: checkin.id }, data: { yesterdayTasks: renamed(checkin.yesterdayTasks), todayTasks: renamed(checkin.todayTasks) } })] : []),
  ]);
  if (description !== undefined && description !== task.description) await syncTaskRefs(user, { ...task, description });

  if (target) {
    const url = `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`;
    const t = target;
    if (t.userId !== user.id) {
      await notify([{ userId: t.userId }], (tr) => ({ title: tr("งานใหม่จาก {0}", [user.name]), body: tr("{0} · ทีม {1}", [newTitle, t.team.name]), url }));
    }
    if (task.assigneeId !== user.id) {
      await notify([{ userId: task.assigneeId }], (tr) => ({ title: tr("{0} โอนงานของคุณให้ {1}", [user.name, t.user.name]), body: newTitle, url }), { email: false });
    }
  }
  revalidateTasks();
  return { ok: true };
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
  if (progress >= 100 && task.progress < 100) await alertUnblocked(user, task);
  if (progress >= 100 && task.parentId) await completeParentIfDone(user, task.parentId);
  revalidateTasks();
  return { ok: true };
}

/** งานย่อยเสร็จครบทุกงาน → งานแม่เป็น 100% เอง (บันทึกในเธรดของงานแม่) และแจ้งคนที่เกี่ยวข้อง */
async function completeParentIfDone(user: CurrentUser, parentId: string) {
  const parent = await prisma.task.findFirst({ where: { id: parentId, deletedAt: null }, select: { id: true, progress: true, doneAt: true } });
  if (!parent || parent.progress >= 100) return;
  const open = await prisma.task.count({ where: { parentId, deletedAt: null, progress: { lt: 100 } } });
  if (open > 0) return;
  const full = await prisma.task.findUniqueOrThrow({ where: { id: parentId } });
  await prisma.$transaction([
    prisma.task.update({ where: { id: parentId }, data: { progress: 100, doneAt: new Date() } }),
    prisma.comment.create({ data: { taskId: parentId, authorId: user.id, body: "", progressFrom: parent.progress, progressTo: 100 } }),
  ]);
  await notifyProgress(user, full, 100, "");
  await alertUnblocked(user, full);
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

/**
 * กำหนด/เลื่อน/ล้างวันกำหนดส่งของงาน ("" = ไม่มีกำหนด) — คนรับงานหรือคนที่ดูแลทีม
 * เลื่อนออกไปต้องใส่เหตุผล · ทุกการเปลี่ยนบันทึกในเธรดของงาน (วันเดิม → วันใหม่ + เหตุผล) และการเลื่อนแจ้งคนที่เกี่ยวข้อง
 */
export async function setDueFor(user: CurrentUser, taskId: string, raw: string, rawReason = ""): Promise<OpResult> {
  const found = await loadTask(user, taskId);
  if (!found || !(found.canManage || found.isAssignee)) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  if (raw !== "" && !isDateKey(raw)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  const { task } = found;
  const from = task.dueDate ? dateToKey(task.dueDate) : null;
  const to = raw || null;
  if (from === to) return { ok: true };
  const reason = rawReason.trim().slice(0, 500);
  const postpone = isPostpone(from, to);
  if (postpone && !reason) return { ok: false, error: "เลื่อนกำหนดส่งต้องใส่เหตุผล" };
  const due = to ? keyToDate(to) : null;
  await prisma.$transaction([
    prisma.task.update({ where: { id: task.id }, data: { dueDate: due } }),
    prisma.comment.create({ data: { taskId: task.id, authorId: user.id, body: reason, dueChange: true, dueFrom: task.dueDate, dueTo: due } }),
  ]);
  if (postpone) await notifyDueChange(user, task, from, to, reason);
  // เลื่อนออกไป = งานที่รองานนี้อาจส่งไม่ทัน
  if (due && (!task.dueDate || due > task.dueDate)) await alertDueMoved(user, task, due);
  revalidateTasks();
  return { ok: true };
}

async function notifyDueChange(
  actor: CurrentUser,
  task: { id: string; teamId: string; assigneeId: string; createdById: string | null; title: string; number: number | null },
  from: string | null,
  to: string | null,
  reason: string,
) {
  const team = await prisma.team.findUnique({ where: { id: task.teamId }, select: { parentId: true } });
  const leads = await prisma.teamMember.findMany({
    where: { teamId: { in: [task.teamId, ...(team?.parentId ? [team.parentId] : [])] }, access: { not: "MEMBER" }, user: { active: true } },
    select: { userId: true },
  });
  const ids = new Set([task.assigneeId, ...(task.createdById ? [task.createdById] : []), ...leads.map((m) => m.userId)]);
  ids.delete(actor.id);
  await notify(
    [...ids].map((userId) => ({ userId })),
    (tr) => ({
      title: to ? tr("{0} เลื่อนกำหนดส่ง {1} → {2}", [actor.name, from ?? "—", to]) : tr("{0} เอากำหนดส่งออก", [actor.name]),
      body: `${task.number === null ? "" : `#${task.number} `}${task.title} — ${reason}`,
      url: `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`,
    }),
    { email: false },
  );
}

/** อ่าน #งาน [[โน้ต]] @คน จากรายละเอียดงาน — คนที่ถูกแท็กใหม่ได้แจ้งเตือน */
async function syncTaskRefs(user: CurrentUser, task: { id: string; teamId: string; number: number | null; title: string; description: string | null }) {
  await syncRefs(task.teamId, { taskId: task.id }, task.description ?? "", {
    actor: user,
    where: (tr) => tr("งาน {0}", [task.number === null ? task.title : `#${task.number} ${task.title}`]),
    url: `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`,
  });
}
