"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getWorkspaceTeams } from "@/lib/teams";
import { spacePeople } from "@/lib/refs";

/** รายการให้เลือกตอนพิมพ์ @ # [[ ในช่องข้อความ — เฉพาะพื้นที่ที่ผู้ใช้เข้าได้ */
export async function refOptions(teamId: string) {
  const user = await requireUser();
  const { teams } = await getWorkspaceTeams(user);
  if (!teams.some((t) => t.id === teamId)) return null;
  const [people, tasks, notes] = await Promise.all([
    spacePeople(teamId),
    prisma.task.findMany({ where: { teamId, deletedAt: null, number: { not: null } }, select: { number: true, title: true, progress: true }, orderBy: { number: "desc" }, take: 300 }),
    prisma.note.findMany({ where: { teamId, deletedAt: null, kind: "NOTE" }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" }, take: 300 }),
  ]);
  return { people, tasks: tasks.map((t) => ({ number: t.number!, title: t.title, progress: t.progress })), notes };
}
