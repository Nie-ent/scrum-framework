import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import { dateToKey } from "./dates";
import { getWorkspaceTeams } from "./teams";

const RECENT_DAYS = 14;

/**
 * หน้า "รอฉัน": ทุกเรื่องที่ค้างอยู่ที่คนนี้ในทุกพื้นที่ที่เข้าได้
 * - เธรดในโน้ตที่ขอให้อ่าน / ตรวจ / แก้ และยังไม่ปิด
 * - งานที่คนอื่นมอบหมายให้และยังไม่เสร็จ (พร้อมงานที่ยังต้องรอ)
 * - งานของฉันที่เพิ่งเริ่มได้ (งานที่ต้องรอเสร็จครบแล้ว ภายใน 14 วัน)
 * - ที่ที่ถูกแท็กล่าสุด (14 วัน)
 */
export async function waitingOn(user: CurrentUser) {
  const { teams } = await getWorkspaceTeams(user);
  const teamIds = teams.map((t) => t.id);
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000);
  const openTask = { assigneeId: user.id, teamId: { in: teamIds }, deletedAt: null, progress: { lt: 100 } } as const;

  const [requests, assigned, blocked, refs] = await Promise.all([
    prisma.comment.findMany({
      where: { assigneeId: user.id, resolvedAt: null, parentId: null, note: { deletedAt: null, teamId: { in: teamIds } } },
      include: { note: { select: { id: true, title: true } }, author: { select: { name: true } }, assignedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.task.findMany({
      where: { ...openTask, createdById: { not: user.id } },
      include: { createdBy: { select: { name: true } }, blockedBy: { select: { blockedBy: { select: { number: true, progress: true, deletedAt: true } } } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 100,
    }),
    prisma.task.findMany({
      where: { ...openTask, blockedBy: { some: {} } },
      select: { id: true, teamId: true, number: true, title: true, blockedBy: { select: { blockedBy: { select: { progress: true, doneAt: true, deletedAt: true } } } } },
      take: 100,
    }),
    prisma.ref.findMany({
      where: { toUserId: user.id, teamId: { in: teamIds }, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        fromTask: { select: { number: true, title: true, teamId: true, deletedAt: true, createdBy: { select: { name: true } }, description: true } },
        fromNote: { select: { id: true, title: true, deletedAt: true, updatedBy: { select: { name: true } } } },
        fromStandup: { select: { teamId: true, date: true, blockers: true, user: { select: { name: true } } } },
        fromComment: {
          select: {
            id: true,
            body: true,
            parentId: true,
            author: { select: { name: true } },
            task: { select: { number: true, title: true, teamId: true, deletedAt: true } },
            note: { select: { id: true, title: true, deletedAt: true } },
            standup: { select: { teamId: true, date: true, user: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  const taskUrl = (t: { teamId: string; number: number | null }) => `/tasks?team=${t.teamId}${t.number === null ? "" : `&task=${t.number}`}`;
  type MentionItem = { id: string; kind: "task" | "note" | "checkin"; where: string; by: string; text: string; at: string; url: string };
  const mentions = refs.flatMap((r): MentionItem[] => {
    const at = r.createdAt.toISOString();
    const c = r.fromComment;
    if (c?.task && !c.task.deletedAt) return [{ id: String(r.id), kind: "task", where: `#${c.task.number} ${c.task.title}`, by: c.author.name, text: c.body, at, url: taskUrl(c.task) }];
    if (c?.note && !c.note.deletedAt) return [{ id: String(r.id), kind: "note", where: c.note.title, by: c.author.name, text: c.body, at, url: `/notes/${c.note.id}?c=${c.parentId ?? c.id}` }];
    if (c?.standup) return [{ id: String(r.id), kind: "checkin", where: c.standup.user.name, by: c.author.name, text: c.body, at, url: `/dashboard?date=${dateToKey(c.standup.date)}&team=${c.standup.teamId}` }];
    if (r.fromTask && !r.fromTask.deletedAt) return [{ id: String(r.id), kind: "task", where: `#${r.fromTask.number} ${r.fromTask.title}`, by: r.fromTask.createdBy?.name ?? "", text: r.fromTask.description ?? "", at, url: taskUrl(r.fromTask) }];
    if (r.fromNote && !r.fromNote.deletedAt) return [{ id: String(r.id), kind: "note", where: r.fromNote.title, by: r.fromNote.updatedBy?.name ?? "", text: "", at, url: `/notes/${r.fromNote.id}` }];
    if (r.fromStandup) return [{ id: String(r.id), kind: "checkin", where: r.fromStandup.user.name, by: r.fromStandup.user.name, text: r.fromStandup.blockers ?? "", at, url: `/dashboard?date=${dateToKey(r.fromStandup.date)}&team=${r.fromStandup.teamId}` }];
    return [];
  });

  return {
    requests: requests.map((c) => ({
      id: c.id,
      note: c.note!,
      kind: c.assignKind!,
      from: c.assignedBy?.name ?? c.author.name,
      quote: c.anchorQuote,
      body: c.body,
      at: c.createdAt.toISOString(),
    })),
    assigned: assigned.map((t) => ({
      id: t.id,
      teamId: t.teamId,
      space: nameOf.get(t.teamId) ?? "",
      number: t.number,
      title: t.title,
      from: t.createdBy?.name ?? null,
      due: t.dueDate ? dateToKey(t.dueDate) : null,
      progress: t.progress,
      waitingOn: t.blockedBy.filter((b) => b.blockedBy.progress < 100 && !b.blockedBy.deletedAt).map((b) => b.blockedBy.number),
      url: taskUrl(t),
    })),
    unblocked: blocked
      .filter((t) => {
        const live = t.blockedBy.filter((b) => !b.blockedBy.deletedAt);
        return live.length > 0 && live.every((b) => b.blockedBy.progress >= 100) && live.some((b) => b.blockedBy.doneAt && b.blockedBy.doneAt >= since);
      })
      .map((t) => ({ id: t.id, space: nameOf.get(t.teamId) ?? "", number: t.number, title: t.title, url: taskUrl(t) })),
    mentions,
  };
}

export type Inbox = Awaited<ReturnType<typeof waitingOn>>;

/** จำนวนเรื่องที่ต้องทำ (ใช้เป็นตัวเลขบนเมนู): คำขอในโน้ต + งานที่เพิ่งเริ่มได้ */
export async function waitingCount(user: CurrentUser) {
  return prisma.comment.count({ where: { assigneeId: user.id, resolvedAt: null, parentId: null, note: { deletedAt: null } } });
}
