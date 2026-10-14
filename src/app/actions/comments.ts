"use server";

import { revalidatePath } from "next/cache";
import type { AssignKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { purgeAttachments } from "@/lib/attachment-store";
import {
  addCommentFor,
  assignThreadFor,
  canDeleteComment,
  completeAssignmentFor,
  editCommentFor,
  noteThreadsFor,
  resolveThreadFor,
  type CommentTargetInput,
} from "@/lib/comment-ops";
import type { Anchor } from "@/lib/anchor";
import type { FormState } from "./auth";

function done() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
  revalidatePath("/dashboard", "layout");
  revalidatePath("/notes", "layout");
  revalidatePath("/inbox");
}

const KINDS: AssignKind[] = ["READ", "REVIEW", "EDIT"];
const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").slice(0, 100);

function targetOf(formData: FormData): CommentTargetInput | undefined {
  const [taskId, standupId, noteId] = [field(formData, "taskId"), field(formData, "standupId"), field(formData, "noteId")];
  return taskId ? { taskId } : standupId ? { standupId } : noteId ? { noteId } : undefined;
}

/** ฟอร์มความคิดเห็นใต้งาน / เช็กอิน (และคำตอบในเธรดด้วย parentId) */
export async function addComment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const result = await addCommentFor(user, {
    target: targetOf(formData),
    parentId: field(formData, "parentId") || undefined,
    body: String(formData.get("body") ?? ""),
    hasFiles: formData.get("hasFiles") === "1",
  });
  if (!result.ok) return { error: result.error };
  done();
  return { ok: "ส่งแล้ว", id: result.id };
}

type Result = { ok: true; id?: string } | { ok: false; error: string };

/** ความคิดเห็นในโน้ต (เรียกจากแผงความคิดเห็น) — ยึดข้อความและมอบหมายได้ */
export async function addNoteComment(input: { noteId: string; parentId?: string; body: string; anchor?: Anchor | null; assign?: { userId: string; kind: AssignKind } | null }): Promise<Result> {
  const user = await requireUser();
  const assign = input.assign && KINDS.includes(input.assign.kind) ? input.assign : null;
  const result = await addCommentFor(user, {
    target: input.parentId ? undefined : { noteId: String(input.noteId) },
    parentId: input.parentId ? String(input.parentId) : undefined,
    body: String(input.body ?? ""),
    anchor: input.anchor ? { quote: String(input.anchor.quote), prefix: String(input.anchor.prefix ?? ""), suffix: String(input.anchor.suffix ?? "") } : null,
    assign,
  });
  if (result.ok) done();
  return result.ok ? { ok: true, id: result.id } : result;
}

export async function editComment(id: string, body: string): Promise<Result> {
  const result = await editCommentFor(await requireUser(), String(id), String(body ?? ""));
  if (result.ok) done();
  return result;
}

export async function resolveThread(id: string, resolved: boolean): Promise<Result> {
  const result = await resolveThreadFor(await requireUser(), String(id), Boolean(resolved));
  if (result.ok) done();
  return result;
}

export async function assignThread(id: string, assign: { userId: string; kind: AssignKind } | null): Promise<Result> {
  const result = await assignThreadFor(await requireUser(), String(id), assign && KINDS.includes(assign.kind) ? { userId: String(assign.userId), kind: assign.kind } : null);
  if (result.ok) done();
  return result;
}

export async function completeAssignment(id: string, action: "read" | "approve" | "changes" | "edited", reason = ""): Promise<Result> {
  if (!["read", "approve", "changes", "edited"].includes(action)) return { ok: false, error: "คำสั่งไม่ถูกต้อง" };
  const result = await completeAssignmentFor(await requireUser(), String(id), action, String(reason ?? "").slice(0, 2000));
  if (result.ok) done();
  return result;
}

/** เธรดของโน้ตสำหรับแผงความคิดเห็น (ดึงซ้ำเป็นระยะ) */
export async function noteThreads(noteId: string) {
  return noteThreadsFor(await requireUser(), String(noteId));
}

/** ลบได้: คนเขียนเอง หรือคนที่ดูแลทีมนั้น — ความคิดเห็นแรกของเธรด = ลบทั้งเธรด */
export async function deleteComment(formData: FormData) {
  await removeComment(String(formData.get("id")));
}

export async function removeComment(id: string): Promise<Result> {
  const user = await requireUser();
  const comment = await canDeleteComment(user, String(id));
  if (!comment) return { ok: false, error: "ลบได้เฉพาะความคิดเห็นของคุณ" };
  // ลบไฟล์แนบใน Storage ไปด้วย (รวมของคำตอบในเธรด) — ถ้า Storage มีปัญหา แถวที่เหลือจะถูก cron เก็บกวาดทีหลัง
  const ids = [comment.id, ...(await prisma.comment.findMany({ where: { parentId: comment.id }, select: { id: true } })).map((c) => c.id)];
  for (const commentId of ids) await purgeAttachments({ commentId }).catch((e) => console.error(e));
  await prisma.comment.delete({ where: { id: comment.id } });
  done();
  return { ok: true };
}
