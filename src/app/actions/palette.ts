"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { keyToDate, todayKey } from "@/lib/dates";
import { parseCommand } from "@/lib/quick-command";
import { createTaskFor, setDueFor, setProgressFor } from "@/lib/task-ops";
import { getWorkspaceTeams } from "@/lib/teams";
import { createNote } from "./notes";

export type PaletteItem = { type: "task" | "note" | "folder" | "file" | "person"; id: string; title: string; sub: string; href: string };
/** done = ข้อความยืนยัน (key แปล + ค่าที่แทรก) · href = หน้าที่ควรเปิดต่อ */
export type CommandResult = { ok: true; done: string; args: (string | number)[]; href: string } | { ok: false; error: string };

const PER_TYPE = 6;

/**
 * ค้นหารวมของแถบคำสั่ง: งาน โน้ต ไฟล์ และคน ในทุกพื้นที่ที่ผู้ใช้เข้าได้ (พื้นที่ที่กำลังใช้ขึ้นก่อน)
 * ต้องตรงทุกคำที่พิมพ์ — "#12" หรือ "12" หางานตามเลขได้ด้วย
 */
export async function paletteSearch(raw: string, spaceId: string): Promise<PaletteItem[]> {
  const user = await requireUser();
  const words = String(raw).trim().slice(0, 100).split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  const { teams } = await getWorkspaceTeams(user);
  if (teams.length === 0) return [];
  const ids = teams.map((t) => t.id);
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const has = (field: string, word: string) => ({ [field]: { contains: word, mode: "insensitive" as const } });
  const number = words.length === 1 ? /^#?(\d{1,6})$/.exec(words[0]) : null;
  const inTeams = { teamId: { in: ids }, deletedAt: null };

  const [tasks, notes, files, people] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...inTeams,
        OR: [
          { AND: words.map((w) => ({ OR: [has("title", w), has("description", w)] })) },
          ...(number ? [{ number: Number(number[1]) }] : []),
        ],
      },
      select: { id: true, number: true, title: true, progress: true, teamId: true, assignee: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE * 3,
    }),
    prisma.note.findMany({
      where: { ...inTeams, AND: words.map((w) => ({ OR: [has("title", w), has("content", w)] })) },
      select: { id: true, title: true, kind: true, teamId: true },
      orderBy: { updatedAt: "desc" },
      take: PER_TYPE * 3,
    }),
    prisma.attachment.findMany({
      where: {
        uploadedAt: { not: null },
        AND: [
          ...words.map((w) => has("name", w)),
          { OR: [{ importantAt: { not: null } }, { expiresAt: { gt: new Date() } }] },
          { OR: [{ task: inTeams }, { comment: { task: inTeams } }, { comment: { standup: { teamId: { in: ids } } } }] },
        ],
      },
      select: { id: true, name: true, task: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE,
    }),
    prisma.teamMember.findMany({
      where: { teamId: { in: ids }, team: { personalOfId: null }, user: { active: true, AND: words.map((w) => ({ OR: [has("name", w), has("email", w)] })) } },
      select: { teamId: true, title: true, user: { select: { id: true, name: true } } },
      take: PER_TYPE * 3,
    }),
  ]);

  // พื้นที่ที่กำลังใช้ขึ้นก่อน (ลำดับเดิมภายในกลุ่มคงไว้)
  const first = <T extends { teamId: string }>(rows: T[]) => [...rows.filter((r) => r.teamId === spaceId), ...rows.filter((r) => r.teamId !== spaceId)].slice(0, PER_TYPE);
  const seen = new Set<string>();
  return [
    ...first(tasks).map((t): PaletteItem => ({
      type: "task",
      id: t.id,
      title: `${t.number === null ? "" : `#${t.number} `}${t.title}`,
      sub: `${nameOf.get(t.teamId) ?? ""} · ${t.assignee.name} · ${t.progress}%`,
      href: `/tasks?team=${t.teamId}${t.number === null ? "" : `&task=${t.number}`}`,
    })),
    ...first(notes).map((n): PaletteItem => ({
      type: n.kind === "FOLDER" ? "folder" : "note",
      id: n.id,
      title: n.title,
      sub: nameOf.get(n.teamId) ?? "",
      href: `/notes/${n.id}`,
    })),
    ...files.map((f): PaletteItem => ({ type: "file", id: f.id, title: f.name, sub: f.task?.title ?? "", href: `/api/files/${f.id}` })),
    // คนเดียวกันอยู่หลายทีม = แสดงครั้งเดียว (ทีมที่กำลังใช้ก่อน) — เปิดแล้วเห็นงานของคนนั้นในทีม
    ...first(people)
      .filter((p) => !seen.has(p.user.id) && seen.add(p.user.id))
      .map((p): PaletteItem => ({
        type: "person",
        id: p.user.id,
        title: p.user.name,
        sub: [nameOf.get(p.teamId), p.title].filter(Boolean).join(" · "),
        href: `/tasks?team=${p.teamId}&q=${encodeURIComponent(p.user.name)}`,
      })),
  ];
}

/**
 * ทำคำสั่งลัดที่พิมพ์ในแถบคำสั่ง — แยกคำสั่งซ้ำบนเซิร์ฟเวอร์ (ไม่เชื่อสิ่งที่เบราว์เซอร์แยกมา)
 * และใช้กฎสิทธิ์ชุดเดียวกับหน้าเว็บ (lib/task-ops) · เลขงาน #N หมายถึงงานในพื้นที่ที่กำลังใช้
 */
export async function runCommand(text: string, spaceId: string): Promise<CommandResult> {
  const user = await requireUser();
  const command = parseCommand(String(text).slice(0, 400), todayKey());
  if (!command) return { ok: false, error: "ไม่เข้าใจคำสั่งนี้" };
  const { teams } = await getWorkspaceTeams(user);
  const space = teams.find((t) => t.id === spaceId);
  if (!space) return { ok: false, error: "คุณไม่ได้อยู่ในทีมนี้" };

  if (command.kind === "task") {
    const result = await createTaskFor(user, { teamId: space.id, assigneeId: user.id, title: command.title, description: null, dueDate: command.due ? keyToDate(command.due) : null });
    if (!result.ok) return result;
    return { ok: true, done: "สร้างงาน #{0} แล้ว", args: [result.task.number], href: `/tasks?team=${space.id}&task=${result.task.number}` };
  }
  if (command.kind === "note") {
    const form = new FormData();
    form.set("teamId", space.id);
    form.set("kind", "NOTE");
    form.set("title", command.title);
    // สำเร็จ = พาไปหน้าโน้ตใหม่ในโหมดแก้ไขเอง (redirect) — กลับมาถึงบรรทัดถัดไปเฉพาะตอนมีข้อผิดพลาด
    const state = await createNote(undefined, form);
    return { ok: false, error: state?.error ?? "สร้างโน้ตไม่สำเร็จ" };
  }

  const task = await prisma.task.findFirst({ where: { teamId: space.id, number: command.number, deletedAt: null }, select: { id: true } });
  if (!task) return { ok: false, error: "ไม่พบงานเลขนี้ในพื้นที่ที่กำลังใช้" };
  const href = `/tasks?team=${space.id}&task=${command.number}`;
  if (command.kind === "open") return { ok: true, done: "", args: [], href };
  if (command.kind === "progress") {
    const result = await setProgressFor(user, task.id, command.progress, "");
    return result.ok ? { ok: true, done: "อัปเดต #{0} เป็น {1}% แล้ว", args: [command.number, command.progress], href } : result;
  }
  const result = await setDueFor(user, task.id, command.due ?? "");
  return result.ok ? { ok: true, done: command.due ? "เลื่อนกำหนดส่ง #{0} แล้ว" : "ล้างกำหนดส่ง #{0} แล้ว", args: [command.number], href } : result;
}
