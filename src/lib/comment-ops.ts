import "server-only";
import type { AssignKind } from "@prisma/client";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey } from "./dates";
import { isPostpone } from "./tasks";
import { notify } from "./notify";
import { teamAccess } from "./access";
import { spacePeople, syncRefs } from "./refs";
import { MAX_QUOTE, type Anchor } from "./anchor";
import type { OpResult } from "./task-ops";
import type { Translate } from "./i18n/core";

/**
 * ความคิดเห็นทุกแบบ: ใต้งาน ใต้เช็กอิน และในโน้ต (ยึดกับข้อความได้แบบ Google Docs)
 * - ตอบเป็นเธรดได้ชั้นเดียว (คำตอบอยู่ใต้ความคิดเห็นแรกของเธรด)
 * - @ชื่อ แท็กคนในพื้นที่ — ได้แจ้งเตือน
 * - เธรดในโน้ตมอบหมายให้คน อ่าน / ตรวจ / แก้ ได้ และปิดเธรดได้
 * ใช้ร่วมกันทั้งหน้าเว็บ (server action) และ MCP
 */
export type CommentTargetInput = { taskId: string } | { standupId: string } | { noteId: string };

export const MAX_BODY = 2000;
const KIND_ASK: Record<AssignKind, string> = { READ: "{0} ขอให้คุณอ่าน: {1}", REVIEW: "{0} ขอให้คุณตรวจ: {1}", EDIT: "{0} ขอให้คุณแก้: {1}" };
const clip = (text: string) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

/** สิ่งที่ถูกคอมเมนต์: ทีม, เจ้าของ (คนรับงาน / คนเขียนเช็กอิน / คนสร้างโน้ต) และข้อมูลสำหรับแจ้งเตือน */
export async function loadTarget(input: CommentTargetInput) {
  if ("taskId" in input) {
    const task = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!task || task.deletedAt) return null;
    const label = task.number === null ? task.title : `#${task.number} ${task.title}`;
    return {
      where: { taskId: task.id },
      teamId: task.teamId as string | null,
      ownerId: task.assigneeId,
      where_: (tr: Translate) => tr("งาน {0}", [label]),
      label,
      url: () => `/tasks?team=${task.teamId}${task.number === null ? "" : `&task=${task.number}`}`,
    };
  }
  if ("standupId" in input) {
    const standup = await prisma.standup.findUnique({ where: { id: input.standupId }, include: { user: { select: { name: true } } } });
    if (!standup) return null;
    const team = standup.teamId ? `team=${standup.teamId}` : "";
    return {
      where: { standupId: standup.id },
      teamId: standup.teamId,
      ownerId: standup.userId,
      where_: (tr: Translate) => tr("เช็กอินของ {0}", [standup.user.name]),
      label: "",
      // เจ้าของเปิดที่หน้าเช็กอินของตัวเอง — คนอื่นในเธรดเปิดที่ภาพรวมของวันนั้น
      url: (recipientId?: string) => (recipientId === standup.userId ? `/standup?${team}` : `/dashboard?date=${dateToKey(standup.date)}&${team}`),
    };
  }
  const note = await prisma.note.findUnique({ where: { id: input.noteId } }).catch(() => null);
  if (!note || note.deletedAt || note.kind !== "NOTE") return null;
  return {
    where: { noteId: note.id },
    teamId: note.teamId as string | null,
    ownerId: note.createdById ?? "",
    where_: (tr: Translate) => tr("โน้ต {0}", [note.title]),
    label: note.title,
    url: () => `/notes/${note.id}`,
  };
}

type Target = NonNullable<Awaited<ReturnType<typeof loadTarget>>>;

async function canRead(user: CurrentUser, target: Target) {
  return (await teamAccess(user, { teamId: target.teamId, ownerId: target.ownerId })).read;
}

/** เธรด (ความคิดเห็นแรก) ที่ id นี้อยู่ พร้อมเป้าหมาย */
async function loadThread(id: string) {
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) return null;
  const root = comment.parentId ? await prisma.comment.findUnique({ where: { id: comment.parentId } }) : comment;
  if (!root) return null;
  const target = await loadTarget(root.taskId ? { taskId: root.taskId } : root.standupId ? { standupId: root.standupId } : { noteId: root.noteId! });
  return target ? { comment, root, target } : null;
}

export async function addCommentFor(
  user: CurrentUser,
  input: {
    target?: CommentTargetInput;
    /** ตอบในเธรดนี้ (ใช้เป้าหมายของเธรด ไม่ต้องส่ง target) */
    parentId?: string;
    body: string;
    /** ยึดกับข้อความในโน้ต (ความคิดเห็นแรกของเธรดในโน้ตเท่านั้น) */
    anchor?: Anchor | null;
    /** มอบหมายเธรดให้คนนี้ (ในโน้ตเท่านั้น) */
    assign?: { userId: string; kind: AssignKind } | null;
    /** มีไฟล์แนบตามมา — ข้อความว่างได้ */
    hasFiles?: boolean;
    /** คนที่จะได้แจ้งเตือนเรื่องนี้แยกต่างหาก (ไม่ต้องแจ้งว่า "ตอบความคิดเห็น" ซ้ำ) */
    quiet?: string[];
  },
): Promise<OpResult<{ id: string }>> {
  const body = input.body.trim();
  if (body.length > MAX_BODY) return { ok: false, error: "ความคิดเห็นยาวเกิน 2,000 ตัวอักษร" };
  if (!body && !input.hasFiles) return { ok: false, error: "กรุณาพิมพ์ความคิดเห็น" };

  let target: Target | null;
  let root: { id: string; authorId: string } | null = null;
  if (input.parentId) {
    const thread = await loadThread(input.parentId);
    if (!thread) return { ok: false, error: "ไม่พบความคิดเห็นนี้" };
    target = thread.target;
    root = thread.root;
  } else {
    target = input.target ? await loadTarget(input.target) : null;
  }
  if (!target || !(await canRead(user, target))) return { ok: false, error: "ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์แสดงความคิดเห็น" };
  const inNote = "noteId" in target.where;
  if ((input.anchor || input.assign) && (!inNote || root)) return { ok: false, error: "ยึดข้อความหรือมอบหมายได้เฉพาะความคิดเห็นแรกในโน้ต" };
  const anchor = input.anchor && input.anchor.quote.trim() ? input.anchor : null;
  if (anchor && anchor.quote.length > MAX_QUOTE) return { ok: false, error: "ข้อความที่เลือกยาวเกินไป" };
  const people = target.teamId ? await spacePeople(target.teamId) : [];
  if (input.assign && !people.some((p) => p.id === input.assign!.userId)) return { ok: false, error: "คนนี้ไม่ได้อยู่ในพื้นที่นี้" };

  const comment = await prisma.comment.create({
    data: {
      ...target.where,
      authorId: user.id,
      body,
      parentId: root?.id ?? null,
      anchorQuote: anchor?.quote ?? null,
      anchorPrefix: anchor ? anchor.prefix.slice(-64) : null,
      anchorSuffix: anchor ? anchor.suffix.slice(0, 64) : null,
      ...(input.assign ? { assigneeId: input.assign.userId, assignKind: input.assign.kind, assignedById: user.id } : {}),
    },
  });

  const url = inNote ? `${target.url()}?c=${root?.id ?? comment.id}` : target.url();
  const mentioned = target.teamId
    ? await syncRefs(target.teamId, { commentId: comment.id }, body, { actor: user, where: target.where_, url, skipNotify: input.assign ? [input.assign.userId] : [] })
    : [];
  if (input.assign && input.assign.userId !== user.id) await notifyAssigned(user, input.assign.userId, input.assign.kind, target, url, body);

  // แจ้งเจ้าของและคนที่อยู่ในเธรด (คนที่ถูกแท็ก/ถูกมอบหมายได้แจ้งแยกแล้ว)
  const earlier = await prisma.comment.findMany({
    where: root ? { OR: [{ id: root.id }, { parentId: root.id }] } : { ...target.where, parentId: null },
    select: { authorId: true },
    distinct: ["authorId"],
  });
  const skip = new Set([user.id, ...mentioned, ...(input.assign ? [input.assign.userId] : []), ...(input.quiet ?? [])]);
  const recipients = [...new Set([target.ownerId, ...earlier.map((c) => c.authorId)])].filter((id) => id && !skip.has(id));
  await notify(
    recipients.map((id) => ({ userId: id, url: inNote ? url : target.url(id) })),
    (tr) => ({ title: root ? tr("{0} ตอบความคิดเห็น", [user.name]) : tr("{0} แสดงความคิดเห็น", [user.name]), body: `${target.label ? `${target.label}: ` : ""}${clip(body || tr("📎 แนบไฟล์"))}`, url }),
  );
  return { ok: true, id: comment.id };
}

async function notifyAssigned(actor: CurrentUser, userId: string, kind: AssignKind, target: Target, url: string, body: string) {
  await notify([{ userId }], (tr) => ({ title: tr(KIND_ASK[kind], [actor.name, target.label]), body: clip(body), url }));
}

/** แก้ข้อความความคิดเห็นของตัวเอง */
export async function editCommentFor(user: CurrentUser, id: string, rawBody: string): Promise<OpResult> {
  const thread = await loadThread(id);
  if (!thread || thread.comment.authorId !== user.id) return { ok: false, error: "แก้ได้เฉพาะความคิดเห็นของคุณ" };
  // รายการอัปเดต % / เปลี่ยนกำหนดส่ง: แก้ได้แค่เหตุผล (ตัวเลขและวันที่คงเดิม)
  const entry = thread.comment.progressTo !== null || thread.comment.dueChange;
  const body = rawBody.trim();
  if (!body && !entry) return { ok: false, error: "กรุณาพิมพ์ความคิดเห็น" };
  if (!body && thread.comment.dueChange && isPostpone(thread.comment.dueFrom && dateToKey(thread.comment.dueFrom), thread.comment.dueTo && dateToKey(thread.comment.dueTo))) {
    return { ok: false, error: "เลื่อนกำหนดส่งต้องใส่เหตุผล" };
  }
  if (body.length > MAX_BODY) return { ok: false, error: "ความคิดเห็นยาวเกิน 2,000 ตัวอักษร" };
  await prisma.comment.update({ where: { id }, data: { body, editedAt: new Date() } });
  if (thread.target.teamId) {
    const url = "noteId" in thread.target.where ? `${thread.target.url()}?c=${thread.root.id}` : thread.target.url();
    await syncRefs(thread.target.teamId, { commentId: id }, body, { actor: user, where: thread.target.where_, url });
  }
  return { ok: true };
}

/** ลบ: คนเขียนเอง หรือคนที่ดูแลทีม — ลบความคิดเห็นแรก = ลบทั้งเธรด */
export async function canDeleteComment(user: CurrentUser, id: string) {
  const thread = await loadThread(id);
  if (!thread) return null;
  if (thread.comment.authorId === user.id) return thread.comment;
  return (await teamAccess(user, { teamId: thread.target.teamId, ownerId: thread.target.ownerId })).manage ? thread.comment : null;
}

/** ปิด/เปิดเธรดอีกครั้ง — ทุกคนที่เห็นเธรดทำได้ */
export async function resolveThreadFor(user: CurrentUser, id: string, resolved: boolean): Promise<OpResult> {
  const thread = await loadThread(id);
  if (!thread || !(await canRead(user, thread.target))) return { ok: false, error: "ไม่พบความคิดเห็นนี้" };
  const { root, target } = thread;
  if (resolved === Boolean(root.resolvedAt)) return { ok: true };
  await prisma.comment.update({ where: { id: root.id }, data: resolved ? { resolvedAt: new Date(), resolvedById: user.id } : { resolvedAt: null, resolvedById: null, approvedAt: null } });
  if (resolved && root.authorId !== user.id) {
    const url = "noteId" in target.where ? `${target.url()}?c=${root.id}` : target.url();
    await notify([{ userId: root.authorId }], (tr) => ({ title: tr("{0} ปิดเธรดของคุณแล้ว", [user.name]), body: clip(root.body), url }), { email: false });
  }
  return { ok: true };
}

/** มอบหมาย/เปลี่ยนคน/เลิกมอบหมายเธรดในโน้ต — ทุกคนที่เห็นเธรดทำได้ (แบบ Google Docs) */
export async function assignThreadFor(user: CurrentUser, id: string, assign: { userId: string; kind: AssignKind } | null): Promise<OpResult> {
  const thread = await loadThread(id);
  if (!thread || !(await canRead(user, thread.target))) return { ok: false, error: "ไม่พบความคิดเห็นนี้" };
  const { root, target } = thread;
  if (!("noteId" in target.where)) return { ok: false, error: "มอบหมายได้เฉพาะความคิดเห็นในโน้ต" };
  if (assign) {
    const people = target.teamId ? await spacePeople(target.teamId) : [];
    if (!people.some((p) => p.id === assign.userId)) return { ok: false, error: "คนนี้ไม่ได้อยู่ในพื้นที่นี้" };
  }
  await prisma.comment.update({
    where: { id: root.id },
    data: assign ? { assigneeId: assign.userId, assignKind: assign.kind, assignedById: user.id, resolvedAt: null, resolvedById: null, approvedAt: null } : { assigneeId: null, assignKind: null, assignedById: null },
  });
  if (assign && assign.userId !== user.id) await notifyAssigned(user, assign.userId, assign.kind, target, `${target.url()}?c=${root.id}`, root.body);
  return { ok: true };
}

/**
 * ผู้รับมอบหมายทำตามที่ขอ:
 * - read: อ่านแล้ว → ปิดเธรด · approve: ตรวจผ่าน → ปิดเธรดและบันทึกว่าโน้ตผ่านการตรวจ
 * - changes: ขอแก้ (ต้องมีเหตุผล) → ตอบในเธรด แล้วมอบหมายให้คนเปิดเธรดแก้
 * - edited: แก้แล้ว → ส่งกลับไปให้คนที่ขอให้แก้ตรวจต่อ
 */
export async function completeAssignmentFor(user: CurrentUser, id: string, action: "read" | "approve" | "changes" | "edited", reason = ""): Promise<OpResult> {
  const thread = await loadThread(id);
  if (!thread) return { ok: false, error: "ไม่พบความคิดเห็นนี้" };
  const { root, target } = thread;
  if (root.assigneeId !== user.id || !root.assignKind || root.resolvedAt) return { ok: false, error: "เธรดนี้ไม่ได้รอคุณอยู่" };
  const expected = { read: "READ", approve: "REVIEW", changes: "REVIEW", edited: "EDIT" }[action];
  if (root.assignKind !== expected) return { ok: false, error: "เธรดนี้ไม่ได้ขอให้ทำแบบนี้" };
  const url = `${target.url()}?c=${root.id}`;
  const now = new Date();

  if (action === "read" || action === "approve") {
    await prisma.comment.update({ where: { id: root.id }, data: { resolvedAt: now, resolvedById: user.id, ...(action === "approve" ? { approvedAt: now } : {}) } });
    const to = root.assignedById ?? root.authorId;
    if (to !== user.id) {
      await notify([{ userId: to }], (tr) => ({ title: action === "read" ? tr("{0} อ่านแล้ว: {1}", [user.name, target.label]) : tr("{0} ตรวจผ่านแล้ว: {1}", [user.name, target.label]), body: clip(root.body), url }));
    }
    return { ok: true };
  }
  if (action === "changes") {
    const text = reason.trim();
    if (!text) return { ok: false, error: "บอกสิ่งที่ต้องแก้ด้วย" };
    const reply = await addCommentFor(user, { parentId: root.id, body: text, quiet: [root.authorId] });
    if (!reply.ok) return reply;
    await prisma.comment.update({ where: { id: root.id }, data: { assigneeId: root.authorId, assignKind: "EDIT", assignedById: user.id } });
    if (root.authorId !== user.id) await notifyAssigned(user, root.authorId, "EDIT", target, url, text);
    return { ok: true };
  }
  // edited
  const back = root.assignedById && root.assignedById !== user.id ? root.assignedById : root.authorId !== user.id ? root.authorId : null;
  if (reason.trim()) {
    const reply = await addCommentFor(user, { parentId: root.id, body: reason, quiet: back ? [back] : [] });
    if (!reply.ok) return reply;
  }
  if (!back) {
    await prisma.comment.update({ where: { id: root.id }, data: { resolvedAt: now, resolvedById: user.id } });
    return { ok: true };
  }
  await prisma.comment.update({ where: { id: root.id }, data: { assigneeId: back, assignKind: "REVIEW", assignedById: user.id } });
  await notifyAssigned(user, back, "REVIEW", target, url, reason.trim() || root.body);
  return { ok: true };
}

/** เธรดทั้งหมดของโน้ต (สำหรับแผงความคิดเห็น — ดึงใหม่ทุก ~30 วินาที) */
export async function noteThreadsFor(user: CurrentUser, noteId: string) {
  const target = await loadTarget({ noteId });
  if (!target || !(await canRead(user, target))) return null;
  const person = { select: { id: true, name: true, avatarUpdatedAt: true } } as const;
  const rows = await prisma.comment.findMany({
    where: { noteId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      author: person,
      assignee: person,
      resolvedBy: person,
      replies: { orderBy: { createdAt: "asc" }, include: { author: person } },
    },
  });
  const who = (u: { id: string; name: string; avatarUpdatedAt: Date | null } | null) => (u ? { id: u.id, name: u.name, avatarUpdatedAt: u.avatarUpdatedAt?.toISOString() ?? null } : null);
  const line = (c: { id: string; body: string; createdAt: Date; editedAt: Date | null; author: { id: string; name: string; avatarUpdatedAt: Date | null } }) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    edited: Boolean(c.editedAt),
    author: who(c.author)!,
  });
  return rows.map((c) => ({
    ...line(c),
    anchor: c.anchorQuote ? { quote: c.anchorQuote, prefix: c.anchorPrefix ?? "", suffix: c.anchorSuffix ?? "" } : null,
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
    resolvedBy: who(c.resolvedBy),
    approvedAt: c.approvedAt?.toISOString() ?? null,
    assignee: who(c.assignee),
    assignKind: c.assignKind,
    replies: c.replies.map(line),
  }));
}

export type NoteThread = NonNullable<Awaited<ReturnType<typeof noteThreadsFor>>>[number];
