import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey } from "./dates";
import { notify } from "./notify";
import { cleanLabelName, isLabelColor, type LabelColor } from "./labels";
import { createsCycle, parentProblem } from "./task-graph";
import { loadTask, revalidateTasks, type OpResult } from "./task-ops";
import { getManageableTeamIds } from "./teams";

/**
 * โครงสร้างของงาน: งานย่อย ป้ายกำกับ และงานที่ต้องรอกัน — ใช้ร่วมกันทั้งหน้าเว็บและ MCP
 * สิทธิ์ปรับโครงสร้างงาน = สิทธิ์แก้ชื่อ/รายละเอียด (หัวหน้าทีม ผู้รับงาน คนสร้างงาน)
 */
async function editable(user: CurrentUser, taskId: string) {
  const found = await loadTask(user, taskId);
  if (!found) return null;
  const { task, canManage, isAssignee } = found;
  return canManage || isAssignee || task.createdById === user.id ? found : null;
}

const taskUrl = (t: { teamId: string; number: number | null }) => `/tasks?team=${t.teamId}${t.number === null ? "" : `&task=${t.number}`}`;
const ref = (t: { number: number | null; title: string }) => (t.number === null ? t.title : `#${t.number} ${t.title}`);

// ---------- งานย่อย ----------

/** ตั้ง/ล้างงานแม่ (parentId = null คือเลิกเป็นงานย่อย) — งานย่อยมีได้ชั้นเดียว */
export async function setParentFor(user: CurrentUser, taskId: string, parentId: string | null): Promise<OpResult> {
  const found = await editable(user, taskId);
  if (!found) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  const { task } = found;
  if (parentId === task.parentId) return { ok: true };
  if (parentId) {
    const [parent, children] = await Promise.all([
      prisma.task.findFirst({ where: { id: parentId, deletedAt: null }, select: { id: true, teamId: true, parentId: true } }),
      prisma.task.count({ where: { parentId: task.id, deletedAt: null } }),
    ]);
    const problem = parentProblem({ id: task.id, teamId: task.teamId, hasSubtasks: children > 0 }, parent);
    if (problem) return { ok: false, error: problem };
  }
  await prisma.task.update({ where: { id: task.id }, data: { parentId } });
  revalidateTasks();
  return { ok: true };
}

/** ตรวจงานแม่ตอนสร้างงานใหม่ (งานใหม่ยังไม่มีงานย่อย) */
export async function checkNewParent(teamId: string, parentId: string): Promise<string | null> {
  const parent = await prisma.task.findFirst({ where: { id: parentId, deletedAt: null }, select: { id: true, teamId: true, parentId: true } });
  return parentProblem({ id: "", teamId, hasSubtasks: false }, parent);
}

// ---------- ป้ายกำกับ ----------

/** ทีมที่ป้ายใช้ได้กับงานในทีมนี้: ทีมเอง + ทีมแม่ */
async function labelTeams(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { parentId: true } });
  return [teamId, ...(team?.parentId ? [team.parentId] : [])];
}

/** ทีมที่เห็นป้ายของทีมนี้ร่วมกัน (ทีมเอง ทีมแม่ และทีมย่อย) — ชื่อป้ายห้ามซ้ำกันในกลุ่มนี้ */
async function sharingTeams(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { parentId: true, children: { select: { id: true } } } });
  return [teamId, ...(team?.parentId ? [team.parentId] : []), ...(team?.children.map((c) => c.id) ?? [])];
}

const sameName = (teams: string[], name: string, exceptId?: string) =>
  prisma.label.findFirst({ where: { teamId: { in: teams }, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true, name: true, color: true, teamId: true } });

/** ป้ายทั้งหมดที่ใช้กับงานในทีมนี้ได้ — ของทีมเองขึ้นก่อน */
export async function availableLabels(teamId: string) {
  const teams = await labelTeams(teamId);
  const labels = await prisma.label.findMany({ where: { teamId: { in: teams } }, select: { id: true, name: true, color: true, teamId: true }, orderBy: { name: "asc" } });
  return labels.sort((a, b) => Number(b.teamId === teamId) - Number(a.teamId === teamId));
}

/** สร้างป้ายในทีม (สมาชิกคนไหนก็สร้างได้) — ชื่อซ้ำกับที่ใช้ได้อยู่แล้ว = ใช้ป้ายเดิม */
export async function createLabelFor(user: CurrentUser, teamId: string, rawName: string, color: LabelColor = "slate"): Promise<OpResult<{ label: { id: string; name: string; color: string } }>> {
  if (!user.memberships.some((m) => m.teamId === teamId) && !(await getManageableTeamIds(user)).has(teamId)) return { ok: false, error: "คุณไม่ได้อยู่ในทีมนี้" };
  const name = cleanLabelName(rawName);
  if (!name) return { ok: false, error: "กรุณาตั้งชื่อป้าย" };
  const existing = (await availableLabels(teamId)).find((l) => l.name.toLowerCase() === name.toLowerCase());
  if (existing) return { ok: true, label: existing };
  // ชื่อนี้มีในทีมย่อยแล้ว — สร้างซ้ำในทีมแม่จะทำให้ทีมย่อยเห็นป้ายชื่อเดียวกันสองอัน
  if (await sameName(await sharingTeams(teamId), name)) return { ok: false, error: "มีป้ายชื่อนี้อยู่แล้วในทีมย่อย" };
  const label = await prisma.label.create({ data: { teamId, name, color: isLabelColor(color) ? color : "slate" }, select: { id: true, name: true, color: true } });
  revalidateTasks();
  return { ok: true, label };
}

/** แก้ชื่อ/สี หรือลบป้าย — เฉพาะคนที่ดูแลทีมของป้าย */
export async function updateLabelFor(user: CurrentUser, labelId: string, change: { name?: string; color?: string } | "delete"): Promise<OpResult> {
  const label = await prisma.label.findUnique({ where: { id: labelId } }).catch(() => null);
  if (!label) return { ok: false, error: "ไม่พบป้ายนี้" };
  if (!(await getManageableTeamIds(user)).has(label.teamId)) return { ok: false, error: "แก้ป้ายได้เฉพาะหัวหน้าทีม" };
  if (change === "delete") {
    await prisma.label.delete({ where: { id: label.id } });
  } else {
    const name = change.name === undefined ? undefined : cleanLabelName(change.name);
    if (name === "") return { ok: false, error: "กรุณาตั้งชื่อป้าย" };
    if (name && name.toLowerCase() !== label.name.toLowerCase()) {
      const clash = await sameName(await sharingTeams(label.teamId), name, label.id);
      if (clash) return { ok: false, error: "มีป้ายชื่อนี้อยู่แล้ว" };
    }
    await prisma.label.update({ where: { id: label.id }, data: { ...(name ? { name } : {}), ...(isLabelColor(change.color) ? { color: change.color } : {}) } });
  }
  revalidateTasks();
  return { ok: true };
}

/** ตั้งป้ายของงานใหม่ทั้งชุด — ป้ายต้องเป็นของทีมนี้หรือทีมแม่ */
export async function setLabelsFor(user: CurrentUser, taskId: string, labelIds: string[]): Promise<OpResult> {
  const found = await editable(user, taskId);
  if (!found) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  const allowed = new Set((await availableLabels(found.task.teamId)).map((l) => l.id));
  const ids = [...new Set(labelIds)];
  if (ids.some((id) => !allowed.has(id))) return { ok: false, error: "ป้ายนี้ใช้กับทีมนี้ไม่ได้" };
  await prisma.$transaction([
    prisma.taskLabel.deleteMany({ where: { taskId: found.task.id } }),
    prisma.taskLabel.createMany({ data: ids.map((labelId) => ({ taskId: found.task.id, labelId })) }),
  ]);
  revalidateTasks();
  return { ok: true };
}

// ---------- งานที่ต้องรอ ----------

/** ให้งานนี้รองาน blockerId — ทีมเดียวกันเท่านั้น และห้ามวน */
export async function addBlockerFor(user: CurrentUser, taskId: string, blockerId: string): Promise<OpResult> {
  const found = await editable(user, taskId);
  if (!found) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  const blocker = await prisma.task.findFirst({ where: { id: blockerId, deletedAt: null }, select: { id: true, teamId: true } });
  if (!blocker || blocker.teamId !== found.task.teamId) return { ok: false, error: "งานที่ต้องรอต้องอยู่ในทีมเดียวกัน" };
  const edges = await prisma.taskDependency.findMany({ where: { task: { teamId: found.task.teamId } }, select: { taskId: true, blockedById: true } });
  if (edges.some((e) => e.taskId === found.task.id && e.blockedById === blocker.id)) return { ok: true };
  if (createsCycle(edges.map((e) => [e.taskId, e.blockedById]), found.task.id, blocker.id)) return { ok: false, error: "ตั้งไม่ได้ เพราะงานจะรอกันเป็นวง" };
  await prisma.taskDependency.create({ data: { taskId: found.task.id, blockedById: blocker.id } });
  revalidateTasks();
  return { ok: true };
}

export async function removeBlockerFor(user: CurrentUser, taskId: string, blockerId: string): Promise<OpResult> {
  const found = await editable(user, taskId);
  if (!found) return { ok: false, error: "คุณไม่มีสิทธิ์แก้งานนี้" };
  await prisma.taskDependency.deleteMany({ where: { taskId: found.task.id, blockedById: blockerId } });
  revalidateTasks();
  return { ok: true };
}

/**
 * เตือนเมื่อกำหนดส่งของงานถูกเลื่อน: งานที่รองานนี้อยู่และมีกำหนดส่งก่อนวันใหม่ จะส่งไม่ทันตามแผน
 * แจ้งผู้รับงานของงานที่รออยู่ (ไม่รวมคนที่เลื่อนเอง)
 */
export async function alertDueMoved(actor: CurrentUser, task: { id: string; teamId: string; number: number | null; title: string }, newDue: Date | null) {
  if (!newDue) return;
  const waiting = await prisma.taskDependency.findMany({
    where: { blockedById: task.id, task: { deletedAt: null, progress: { lt: 100 }, dueDate: { lt: newDue } } },
    select: { task: { select: { assigneeId: true, number: true, title: true, teamId: true, dueDate: true } } },
  });
  for (const { task: w } of waiting) {
    if (w.assigneeId === actor.id) continue;
    await notify([{ userId: w.assigneeId }], (tr) => ({
      title: tr("งานที่คุณรออยู่ถูกเลื่อน: {0}", [ref(task)]),
      body: tr("กำหนดส่งใหม่ {0} ซึ่งหลังกำหนดส่งของ {1} ({2})", [dateToKey(newDue), ref(w), w.dueDate ? dateToKey(w.dueDate) : "—"]),
      url: taskUrl(w),
    }));
  }
}

/** งานนี้เพิ่งเสร็จ: งานที่รองานนี้และไม่ต้องรออะไรแล้ว แจ้งผู้รับงานว่าเริ่มได้ */
export async function alertUnblocked(actor: CurrentUser, task: { id: string; number: number | null; title: string }) {
  const waiting = await prisma.taskDependency.findMany({
    where: { blockedById: task.id, task: { deletedAt: null, progress: { lt: 100 } } },
    select: { task: { select: { id: true, assigneeId: true, number: true, title: true, teamId: true, blockedBy: { select: { blockedBy: { select: { progress: true, deletedAt: true } } } } } } },
  });
  for (const { task: w } of waiting) {
    const stillWaiting = w.blockedBy.some((b) => b.blockedBy.progress < 100 && !b.blockedBy.deletedAt);
    if (stillWaiting || w.assigneeId === actor.id) continue;
    await notify([{ userId: w.assigneeId }], (tr) => ({ title: tr("เริ่ม {0} ได้แล้ว", [ref(w)]), body: tr("{0} ที่ต้องรอเสร็จแล้ว", [ref(task)]), url: taskUrl(w) }));
  }
}
