import "server-only";
import { cache } from "react";
import { prisma } from "./db";
import { extractLinks, linkResolver } from "./note-links";

export type NoteNode = { id: string; parentId: string | null; kind: "FOLDER" | "NOTE"; title: string };
export type NoteTreeNode = NoteNode & { children: NoteTreeNode[] };

/** โฟลเดอร์และโน้ตทั้งหมดของทีม (ไม่รวมที่ถูกลบ) */
export const listNotes = (teamId: string): Promise<NoteNode[]> =>
  prisma.note.findMany({
    where: { teamId, deletedAt: null },
    select: { id: true, parentId: true, kind: true, title: true },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
  });

/** จัดเป็นต้นไม้: โฟลเดอร์ขึ้นก่อนโน้ต เรียงตามชื่อ */
export function buildTree(nodes: NoteNode[]): NoteTreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, { ...n, children: [] as NoteTreeNode[] }]));
  const roots: NoteTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** เส้นทางจากรากถึงโน้ตนี้ (สำหรับ breadcrumb) */
export function pathTo(nodes: NoteNode[], id: string): NoteNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: NoteNode[] = [];
  for (let node = byId.get(id); node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    path.unshift(node);
    if (path.length > 50) break;
  }
  return path;
}

/** id ของโหนดนี้และลูกหลานทั้งหมด */
export function descendantIds(nodes: NoteNode[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const n of nodes) if (n.parentId === out[i]) out.push(n.id);
  return out;
}

/**
 * อ่านลิงก์จากเนื้อหาแล้วเขียนตาราง NoteLink ของโน้ตนี้ใหม่ทั้งชุด
 * ลิงก์ไปชื่อที่ยังไม่มีโน้ตจะไม่ถูกเก็บ (จะถูกเก็บเมื่อมีโน้ตชื่อนั้น — ดู relinkMentions)
 * ปลายทางหาด้วย linkResolver ตัวเดียวกับตอนแสดงผล — ลิงก์ไปหัวข้อในโน้ตตัวเองไม่นับเป็นความสัมพันธ์
 */
export async function syncLinks(note: { id: string; teamId: string; parentId: string | null; content: string }, nodes?: NoteNode[]) {
  const { targets, taskNumbers } = extractLinks(note.content);
  const [all, tasks] = await Promise.all([
    targets.length === 0 ? [] : (nodes ?? listNotes(note.teamId)),
    taskNumbers.length === 0 ? [] : prisma.task.findMany({ where: { teamId: note.teamId, number: { in: taskNumbers }, deletedAt: null }, select: { id: true } }),
  ]);
  const resolve = linkResolver(all, note);
  const noteIds = new Set(targets.flatMap((t) => resolve(t).noteId ?? []));
  noteIds.delete(note.id);
  await prisma.$transaction([
    prisma.noteLink.deleteMany({ where: { fromId: note.id } }),
    prisma.noteLink.createMany({
      data: [...[...noteIds].map((toNoteId) => ({ fromId: note.id, toNoteId })), ...tasks.map((t) => ({ fromId: note.id, toTaskId: t.id }))],
    }),
  ]);
}

/**
 * มีโน้ตชื่อนี้เกิดขึ้น/เปลี่ยนชื่อ/ย้ายที่: โน้ตอื่นในทีมที่เขียนลิงก์ถึงชื่อนี้ไว้จะเชื่อมกันใหม่ทันที
 * (ค้นจากชื่อในเนื้อหา เพราะลิงก์อาจมีโฟลเดอร์นำหน้า เช่น [[โฟลเดอร์/ชื่อ]])
 */
export async function relinkMentions(teamId: string, title: string) {
  const [mentions, nodes] = await Promise.all([
    prisma.note.findMany({
      where: { teamId, kind: "NOTE", deletedAt: null, AND: [{ content: { contains: "[[" } }, { content: { contains: title.trim(), mode: "insensitive" } }] },
      select: { id: true, teamId: true, parentId: true, content: true },
      take: 200,
    }),
    listNotes(teamId),
  ]);
  for (const note of mentions) await syncLinks(note, nodes);
}

/** id ของโน้ต/โฟลเดอร์ที่คนนี้ติดดาวไว้ในทีมนี้ */
export const favoriteIds = cache(async (userId: string, teamId: string): Promise<string[]> => {
  const rows = await prisma.noteFavorite.findMany({ where: { userId, note: { teamId, deletedAt: null } }, select: { noteId: true }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => r.noteId);
});
