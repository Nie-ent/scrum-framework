import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { spacePeople } from "./refs";
import type { RefContext } from "@/components/ref-text";

/** ข้อมูลสำหรับแสดง #งาน [[โน้ต]] @คน เป็นป้ายในพื้นที่นี้ (โหลดครั้งเดียวต่อคำขอ) */
export const refContext = cache(async (teamId: string): Promise<RefContext> => {
  const [people, tasks, notes] = await Promise.all([
    spacePeople(teamId),
    prisma.task.findMany({ where: { teamId, deletedAt: null, number: { not: null } }, select: { number: true, title: true, progress: true, assignee: { select: { name: true } } }, take: 1000 }),
    prisma.note.findMany({ where: { teamId, deletedAt: null, kind: "NOTE" }, select: { id: true, title: true }, take: 2000 }),
  ]);
  return { teamId, people, tasks: tasks.map((t) => ({ number: t.number!, title: t.title, progress: t.progress, assignee: t.assignee.name })), notes };
});
