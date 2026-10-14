import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { dateToKey } from "./dates";
import type { Translate } from "./i18n/core";
import type { IconName } from "@/components/icons";

export type Backlink = { key: string; label: string; href: string; icon: IconName };

const taskHref = (t: { teamId: string; number: number | null }) => `/tasks?team=${t.teamId}${t.number === null ? "" : `&task=${t.number}`}`;

/** ที่ที่อ้างถึงสิ่งนี้ (นอกจากลิงก์ในเนื้อโน้ต): งานอื่น ความคิดเห็น และเช็กอิน — ไม่ซ้ำ ใหม่ก่อน */
async function sources(where: Prisma.RefWhereInput, tr: Translate): Promise<Backlink[]> {
  const refs = await prisma.ref.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      fromTask: { select: { number: true, title: true, teamId: true, deletedAt: true } },
      fromNote: { select: { id: true, title: true, deletedAt: true } },
      fromStandup: { select: { date: true, teamId: true, user: { select: { name: true } } } },
      fromComment: {
        select: {
          id: true,
          parentId: true,
          author: { select: { name: true } },
          task: { select: { number: true, title: true, teamId: true, deletedAt: true } },
          note: { select: { id: true, title: true, deletedAt: true } },
          standup: { select: { date: true, teamId: true, user: { select: { name: true } } } },
        },
      },
    },
  });
  const out = new Map<string, Backlink>();
  const add = (b: Backlink) => !out.has(b.href) && out.set(b.href, b);
  for (const r of refs) {
    const key = String(r.id);
    const c = r.fromComment;
    if (r.fromTask && !r.fromTask.deletedAt) add({ key, label: `#${r.fromTask.number} ${r.fromTask.title}`, href: taskHref(r.fromTask), icon: "link" });
    else if (r.fromNote && !r.fromNote.deletedAt) add({ key, label: r.fromNote.title, href: `/notes/${r.fromNote.id}`, icon: "note" });
    else if (r.fromStandup) add({ key, label: tr("เช็กอินของ {0} · {1}", [r.fromStandup.user.name, dateToKey(r.fromStandup.date)]), href: `/dashboard?date=${dateToKey(r.fromStandup.date)}&team=${r.fromStandup.teamId}`, icon: "comment" });
    else if (c?.task && !c.task.deletedAt) add({ key, label: tr("ความคิดเห็นของ {0} ใน #{1} {2}", [c.author.name, c.task.number ?? "", c.task.title]), href: taskHref(c.task), icon: "comment" });
    else if (c?.note && !c.note.deletedAt) add({ key, label: tr("ความคิดเห็นของ {0} ในโน้ต {1}", [c.author.name, c.note.title]), href: `/notes/${c.note.id}?c=${c.parentId ?? c.id}`, icon: "comment" });
    else if (c?.standup) add({ key, label: tr("ความคิดเห็นของ {0} ในเช็กอินของ {1}", [c.author.name, c.standup.user.name]), href: `/dashboard?date=${dateToKey(c.standup.date)}&team=${c.standup.teamId}`, icon: "comment" });
  }
  return [...out.values()];
}

export const taskBacklinks = (taskId: string, tr: Translate) => sources({ toTaskId: taskId }, tr);
export const noteBacklinks = (noteId: string, tr: Translate) => sources({ toNoteId: noteId }, tr);
/** ที่ที่คนนี้ถูกแท็ก — เฉพาะในพื้นที่ที่คนดูเข้าได้ */
export const personMentions = (userId: string, teamIds: string[], tr: Translate) => sources({ toUserId: userId, teamId: { in: teamIds } }, tr);
