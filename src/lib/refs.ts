import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { notify } from "./notify";
import { linkResolver } from "./note-links";
import { listNotes } from "./notes";
import { extractRefs } from "./ref-parse";
import type { Person } from "./mentions";
import type { Translate } from "./i18n/core";

/**
 * คนที่แท็กได้ในพื้นที่นี้ = คนที่เห็นของในพื้นที่นี้: สมาชิกของทีม และหัวหน้า/เจ้าของของทีมแม่
 * (พื้นที่ส่วนตัวมีเจ้าของคนเดียว จึงแท็กคนอื่นไม่ได้)
 */
export async function spacePeople(teamId: string): Promise<Person[]> {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { parentId: true } });
  const rows = await prisma.teamMember.findMany({
    where: {
      user: { active: true },
      OR: [{ teamId }, ...(team?.parentId ? [{ teamId: team.parentId, access: { not: "MEMBER" as const } }] : [])],
    },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return [...new Map(rows.map((r) => [r.user.id, r.user])).values()];
}

export type RefSource = { noteId: string } | { taskId: string } | { commentId: string } | { standupId: string };

const fromWhere = (source: RefSource): Prisma.RefWhereInput =>
  "noteId" in source ? { fromNoteId: source.noteId } : "taskId" in source ? { fromTaskId: source.taskId } : "commentId" in source ? { fromCommentId: source.commentId } : { fromStandupId: source.standupId };

const fromData = (source: RefSource) =>
  "noteId" in source ? { fromNoteId: source.noteId } : "taskId" in source ? { fromTaskId: source.taskId } : "commentId" in source ? { fromCommentId: source.commentId } : { fromStandupId: source.standupId };

/**
 * อ่าน #งาน [[โน้ต]] @คน จากข้อความแล้วเขียนตาราง Ref ของต้นทางนี้ใหม่ทั้งชุด
 * คนที่ถูกแท็กใหม่ (ไม่เคยถูกแท็กในข้อความนี้มาก่อน) ได้แจ้งเตือน — ยกเว้นคนที่แท็กเอง และคนใน `skipNotify`
 * โน้ต: ลิงก์ไปโน้ต/งานอยู่ใน NoteLink แล้ว ที่นี่เก็บเฉพาะ @คน
 */
export async function syncRefs(
  teamId: string,
  source: RefSource,
  text: string,
  options: { actor: { id: string; name: string }; where: (tr: Translate) => string; url: string; skipNotify?: string[] },
): Promise<string[]> {
  const people = await spacePeople(teamId);
  const { taskNumbers, noteTargets, userIds } = extractRefs(text, people);
  const fromNote = "noteId" in source;
  const [tasks, nodes, previous] = await Promise.all([
    fromNote || taskNumbers.length === 0 ? [] : prisma.task.findMany({ where: { teamId, number: { in: taskNumbers }, deletedAt: null }, select: { id: true } }),
    fromNote || noteTargets.length === 0 ? [] : listNotes(teamId),
    prisma.ref.findMany({ where: { ...fromWhere(source), toUserId: { not: null } }, select: { toUserId: true } }),
  ]);
  const resolve = linkResolver(nodes, { id: "", parentId: null });
  const noteIds = [...new Set(noteTargets.flatMap((t) => resolve(t).noteId ?? []))];
  // งานไม่อ้างถึงตัวเอง
  const taskIds = tasks.map((t) => t.id).filter((id) => !("taskId" in source) || id !== source.taskId);

  await prisma.$transaction([
    prisma.ref.deleteMany({ where: fromWhere(source) }),
    prisma.ref.createMany({
      data: [
        ...taskIds.map((toTaskId) => ({ teamId, ...fromData(source), toTaskId })),
        ...noteIds.map((toNoteId) => ({ teamId, ...fromData(source), toNoteId })),
        ...userIds.map((toUserId) => ({ teamId, ...fromData(source), toUserId })),
      ],
    }),
  ]);

  const before = new Set(previous.map((p) => p.toUserId));
  const skip = new Set([options.actor.id, ...(options.skipNotify ?? [])]);
  const fresh = userIds.filter((id) => !before.has(id) && !skip.has(id));
  if (fresh.length > 0) {
    const clip = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    await notify(
      fresh.map((userId) => ({ userId })),
      (tr) => ({ title: tr("{0} กล่าวถึงคุณใน{1}", [options.actor.name, options.where(tr)]), body: clip, url: options.url }),
    );
  }
  return userIds;
}

/** ลบการอ้างถึงของต้นทางนี้ (เช่น ความคิดเห็นถูกลบ — FK cascade ก็ลบให้อยู่แล้ว ใช้กับข้อความที่ถูกล้าง) */
export const clearRefs = (source: RefSource) => prisma.ref.deleteMany({ where: fromWhere(source) });
