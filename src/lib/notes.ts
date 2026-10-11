import "server-only";
import { prisma } from "./db";
import { extractLinks, noteKey } from "./note-links";

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
 */
export async function syncLinks(note: { id: string; teamId: string; content: string }) {
  const { titles, taskNumbers } = extractLinks(note.content);
  const wanted = new Set(titles.map(noteKey));
  const [candidates, tasks] = await Promise.all([
    wanted.size === 0 ? [] : prisma.note.findMany({ where: { teamId: note.teamId, kind: "NOTE", deletedAt: null, id: { not: note.id } }, select: { id: true, title: true } }),
    taskNumbers.length === 0 ? [] : prisma.task.findMany({ where: { teamId: note.teamId, number: { in: taskNumbers }, deletedAt: null }, select: { id: true } }),
  ]);
  // ชื่อซ้ำกันหลายโน้ต: ลิงก์ไปโน้ตแรกตามลำดับชื่อ (เหมือนตอนแสดงผล)
  const firstByKey = new Map<string, string>();
  for (const c of candidates) if (wanted.has(noteKey(c.title)) && !firstByKey.has(noteKey(c.title))) firstByKey.set(noteKey(c.title), c.id);
  await prisma.$transaction([
    prisma.noteLink.deleteMany({ where: { fromId: note.id } }),
    prisma.noteLink.createMany({
      data: [...[...firstByKey.values()].map((toNoteId) => ({ fromId: note.id, toNoteId })), ...tasks.map((t) => ({ fromId: note.id, toTaskId: t.id }))],
    }),
  ]);
}

/** มีโน้ตชื่อนี้เกิดขึ้น/เปลี่ยนชื่อ: โน้ตอื่นในทีมที่เขียน [[ชื่อนี้]] ไว้ก่อนแล้วจะเชื่อมกันทันที */
export async function relinkMentions(teamId: string, title: string) {
  const mentions = await prisma.note.findMany({
    where: { teamId, kind: "NOTE", deletedAt: null, content: { contains: `[[${title.trim()}`, mode: "insensitive" } },
    select: { id: true, teamId: true, content: true },
    take: 200,
  });
  for (const note of mentions) await syncLinks(note);
}
