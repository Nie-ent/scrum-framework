"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { teamAccess } from "@/lib/access";
import { linkResolver, noteKey, renameLinks } from "@/lib/note-links";
import { descendantIds, listNotes, relinkMentions, syncLinks, syncNoteMentions } from "@/lib/notes";
import { NoteFields, noteTitle } from "@/lib/schemas";
import type { FormState } from "./auth";

function done() {
  revalidatePath("/notes", "layout");
  revalidatePath("/tasks");
}

/** ทุกคนในทีม (และคนที่ดูแลทีม) อ่านและแก้โน้ตของทีมได้ — manage = ลบของคนอื่นได้ */
const access = (user: CurrentUser, teamId: string) => teamAccess(user, { teamId, ownerId: user.id });

async function loadNote(user: CurrentUser, id: string) {
  const note = await prisma.note.findUnique({ where: { id } }).catch(() => null);
  if (!note || note.deletedAt) return null;
  const rights = await access(user, note.teamId);
  return rights.read ? { note, manage: rights.manage } : null;
}

/** ชื่อซ้ำในโฟลเดอร์เดียวกันไม่ได้ (เทียบแบบไม่สนตัวพิมพ์) */
async function nameTaken(teamId: string, parentId: string | null, title: string, exceptId?: string) {
  const siblings = await prisma.note.findMany({ where: { teamId, parentId, deletedAt: null, id: exceptId ? { not: exceptId } : undefined }, select: { title: true } });
  return siblings.some((s) => noteKey(s.title) === noteKey(title));
}

const CreateSchema = z.object({
  teamId: z.string().min(1),
  parentId: z.string().max(40).transform((v) => v || null),
  kind: z.enum(["FOLDER", "NOTE"]),
  title: noteTitle,
});

/** สร้างโฟลเดอร์หรือโน้ต — โน้ตใหม่เปิดในโหมดแก้ไขทันที */
export async function createNote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = CreateSchema.safeParse({
    teamId: formData.get("teamId") ?? "",
    parentId: formData.get("parentId") ?? "",
    kind: formData.get("kind") ?? "NOTE",
    title: formData.get("title") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { teamId, parentId, kind, title } = parsed.data;
  if (!(await access(user, teamId)).read) return { error: "คุณไม่ได้อยู่ในทีมนี้" };
  if (parentId) {
    const parent = await prisma.note.findUnique({ where: { id: parentId } }).catch(() => null);
    if (!parent || parent.deletedAt || parent.teamId !== teamId || parent.kind !== "FOLDER") return { error: "ไม่พบโฟลเดอร์ปลายทาง" };
  }
  if (await nameTaken(teamId, parentId, title)) return { error: "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้" };

  const note = await prisma.note.create({ data: { teamId, parentId, kind, title, createdById: user.id, updatedById: user.id } });
  if (kind === "NOTE") await relinkMentions(teamId, title);
  done();
  if (kind === "NOTE") redirect(`/notes/${note.id}?edit=1`);
  return { ok: "สร้างโฟลเดอร์แล้ว" };
}

/**
 * บันทึกชื่อและเนื้อหา — ถ้ามีคนอื่นบันทึกไปก่อนหลังจากที่เราเปิด จะไม่เขียนทับ (ให้โหลดใหม่ก่อน)
 * เปลี่ยนชื่อแล้วลิงก์ [[ชื่อเดิม]] ในโน้ตอื่นจะถูกแก้ตาม
 */
export async function saveNote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadNote(user, String(formData.get("id") ?? ""));
  if (!found || found.note.kind !== "NOTE") return { error: "ไม่พบโน้ตนี้ หรือคุณไม่มีสิทธิ์แก้ไข" };
  const parsed = NoteFields.safeParse({ title: formData.get("title") ?? "", content: formData.get("content") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { note } = found;
  const { title, content } = parsed.data;

  if (String(formData.get("version") ?? "") !== note.updatedAt.toISOString()) {
    return { error: "มีคนอื่นแก้โน้ตนี้ไปแล้วระหว่างที่คุณเขียน — คัดลอกสิ่งที่คุณเขียนไว้ แล้วโหลดหน้าใหม่เพื่อดูเวอร์ชันล่าสุด" };
  }
  const renamed = title !== note.title;
  if (renamed && (await nameTaken(note.teamId, note.parentId, title, note.id))) return { error: "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้" };

  // ต้นไม้ก่อนเปลี่ยนชื่อ — ใช้ดูว่าลิงก์ไหนในโน้ตอื่นชี้มาที่โน้ตนี้จริง (ไม่ใช่โน้ตอื่นที่ชื่อซ้ำกัน)
  const before = renamed ? await listNotes(note.teamId) : [];
  await prisma.note.update({ where: { id: note.id }, data: { title, content, updatedById: user.id } });
  await syncLinks({ id: note.id, teamId: note.teamId, parentId: note.parentId, content });
  await syncNoteMentions(user, { id: note.id, teamId: note.teamId, title }, content);
  if (renamed) {
    // โน้ตที่ลิงก์มาหาเรา: แก้ชื่อในเนื้อหาให้ตรงกับชื่อใหม่
    const backlinks = await prisma.note.findMany({ where: { linksOut: { some: { toNoteId: note.id } }, deletedAt: null }, select: { id: true, parentId: true, content: true } });
    for (const b of backlinks) {
      await prisma.note.update({ where: { id: b.id }, data: { content: renameLinks(b.content, linkResolver(before, b), note.id, title) } });
    }
    // ชื่อเดิมอาจยังมีโน้ตอื่นใช้อยู่ — ลิงก์ที่เคยชี้มาที่นี่เพราะอยู่ใกล้กว่าต้องหาปลายทางใหม่
    await relinkMentions(note.teamId, note.title);
    await relinkMentions(note.teamId, title);
  }
  done();
  redirect(`/notes/${note.id}`);
}

/** เปลี่ยนชื่อโฟลเดอร์ */
export async function renameFolder(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadNote(user, String(formData.get("id") ?? ""));
  if (!found || found.note.kind !== "FOLDER") return { error: "ไม่พบโฟลเดอร์นี้" };
  const parsed = noteTitle.safeParse(formData.get("title") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (await nameTaken(found.note.teamId, found.note.parentId, parsed.data, found.note.id)) return { error: "มีชื่อนี้อยู่แล้วในโฟลเดอร์นี้" };
  await prisma.note.update({ where: { id: found.note.id }, data: { title: parsed.data, updatedById: user.id } });
  done();
  return { ok: "เปลี่ยนชื่อแล้ว" };
}

/**
 * ย้ายที่แล้ว "โน้ตที่ใกล้ที่สุด" ของชื่อที่ซ้ำกันอาจเปลี่ยน — หาปลายทางของลิงก์ใหม่
 * ทั้งลิงก์ที่โน้ตที่ย้ายเขียนไว้ และลิงก์ในโน้ตอื่นที่อ้างถึงชื่อซ้ำนั้น (ทีมที่ไม่มีชื่อซ้ำไม่ต้องทำอะไร)
 */
async function relinkMoved(teamId: string, id: string) {
  const nodes = await listNotes(teamId);
  const count = new Map<string, number>();
  for (const n of nodes) if (n.kind === "NOTE") count.set(noteKey(n.title), (count.get(noteKey(n.title)) ?? 0) + 1);
  if (![...count.values()].some((c) => c > 1)) return;
  const movedIds = descendantIds(nodes, id);
  const moved = await prisma.note.findMany({ where: { id: { in: movedIds }, kind: "NOTE", deletedAt: null }, select: { id: true, teamId: true, parentId: true, title: true, content: true } });
  for (const m of moved) {
    await syncLinks(m, nodes);
    if ((count.get(noteKey(m.title)) ?? 0) > 1) await relinkMentions(teamId, m.title);
  }
}

/** ย้ายโน้ตหรือโฟลเดอร์ไปโฟลเดอร์อื่น (ว่าง = ระดับบนสุด) */
export async function moveNote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadNote(user, String(formData.get("id") ?? ""));
  if (!found) return { error: "ไม่พบรายการนี้" };
  const { note } = found;
  const parentId = String(formData.get("parentId") ?? "") || null;
  if (parentId) {
    const nodes = await listNotes(note.teamId);
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent || parent.kind !== "FOLDER") return { error: "ไม่พบโฟลเดอร์ปลายทาง" };
    if (descendantIds(nodes, note.id).includes(parentId)) return { error: "ย้ายโฟลเดอร์เข้าไปในตัวเองไม่ได้" };
  }
  if (await nameTaken(note.teamId, parentId, note.title, note.id)) return { error: "มีชื่อนี้อยู่แล้วในโฟลเดอร์ปลายทาง" };
  await prisma.note.update({ where: { id: note.id }, data: { parentId } });
  await relinkMoved(note.teamId, note.id);
  done();
  return { ok: "ย้ายแล้ว" };
}

/** ลบ (ซ่อน) โน้ต หรือโฟลเดอร์พร้อมทุกอย่างข้างใน — คนสร้าง หรือคนที่ดูแลทีม */
export async function deleteNote(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadNote(user, String(formData.get("id") ?? ""));
  if (!found) return { error: "ไม่พบรายการนี้" };
  const { note, manage } = found;
  if (!manage && note.createdById !== user.id) return { error: "ลบได้เฉพาะคนที่สร้าง หรือหัวหน้า/เจ้าของทีม" };
  const ids = descendantIds(await listNotes(note.teamId), note.id);
  await prisma.$transaction([
    prisma.note.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } }),
    // ความสัมพันธ์ของสิ่งที่ถูกลบไม่ควรโผล่ใน backlink / แผนผัง
    prisma.noteLink.deleteMany({ where: { OR: [{ fromId: { in: ids } }, { toNoteId: { in: ids } }] } }),
  ]);
  done();
  // เรียกจากเมนูในรายการ (stay) = อยู่หน้าเดิม · เรียกจากหน้าโน้ตเอง = กลับหน้าแรกของโน้ต
  if (formData.get("stay")) return { ok: "ลบแล้ว" };
  redirect(`/notes?team=${note.teamId}`);
}

/** เพิ่ม/เอาออกจากรายการโปรดของตัวเอง (โน้ตหรือโฟลเดอร์) */
export async function toggleFavorite(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const found = await loadNote(user, String(formData.get("id") ?? ""));
  if (!found) return { error: "ไม่พบรายการนี้" };
  const key = { userId_noteId: { userId: user.id, noteId: found.note.id } };
  const existing = await prisma.noteFavorite.findUnique({ where: key });
  if (existing) await prisma.noteFavorite.delete({ where: key });
  else await prisma.noteFavorite.create({ data: { userId: user.id, noteId: found.note.id } });
  done();
  return { ok: existing ? "เอาออกจากรายการโปรดแล้ว" : "เพิ่มในรายการโปรดแล้ว" };
}
