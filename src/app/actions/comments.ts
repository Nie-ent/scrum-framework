"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey } from "@/lib/dates";
import { notify } from "@/lib/notify";
import { teamAccess } from "@/lib/access";
import { purgeAttachments } from "@/lib/attachment-store";
import type { FormState } from "./auth";

const CommentSchema = z.object({
  taskId: z.string().max(40),
  standupId: z.string().max(40),
  body: z.string().trim().max(2000, { error: "ความคิดเห็นยาวเกิน 2,000 ตัวอักษร" }),
  /** มีไฟล์แนบตามมา — ข้อความว่างได้ */
  hasFiles: z.boolean(),
});

function done() {
  revalidatePath("/tasks");
  revalidatePath("/standup");
  revalidatePath("/dashboard", "layout");
}

/** สิ่งที่ถูกคอมเมนต์: ทีม, เจ้าของ (คนรับงาน / คนเขียนเช็กอิน) และข้อมูลสำหรับแจ้งเตือน */
async function loadTarget(taskId: string, standupId: string) {
  if (taskId) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task || task.deletedAt) return null;
    return {
      where: { taskId },
      teamId: task.teamId,
      ownerId: task.assigneeId,
      label: task.title,
      url: () => `/tasks?team=${task.teamId}`,
    };
  }
  if (standupId) {
    const standup = await prisma.standup.findUnique({ where: { id: standupId } });
    if (!standup) return null;
    const team = standup.teamId ? `team=${standup.teamId}` : "";
    return {
      where: { standupId },
      teamId: standup.teamId,
      ownerId: standup.userId,
      label: "เช็กอินของคุณ",
      // เจ้าของเปิดที่หน้าเช็กอินของตัวเอง — คนอื่นในเธรดเปิดที่ภาพรวมของวันนั้น
      url: (recipientId: string) =>
        recipientId === standup.userId ? `/standup?${team}` : `/dashboard?date=${dateToKey(standup.date)}&${team}`,
    };
  }
  return null;
}

export async function addComment(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = CommentSchema.safeParse({
    taskId: formData.get("taskId") ?? "",
    standupId: formData.get("standupId") ?? "",
    body: formData.get("body") ?? "",
    hasFiles: formData.get("hasFiles") === "1",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!parsed.data.body && !parsed.data.hasFiles) return { error: "กรุณาพิมพ์ความคิดเห็น" };

  const target = await loadTarget(parsed.data.taskId, parsed.data.standupId);
  if (!target || !(await teamAccess(user, target)).read) return { error: "ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์แสดงความคิดเห็น" };

  const comment = await prisma.comment.create({ data: { ...target.where, authorId: user.id, body: parsed.data.body } });

  // แจ้งเจ้าของและคนที่เคยคอมเมนต์ในเธรดนี้
  const earlier = await prisma.comment.findMany({ where: target.where, select: { authorId: true }, distinct: ["authorId"] });
  const recipientIds = [...new Set([target.ownerId, ...earlier.map((c) => c.authorId)])].filter((id) => id !== user.id);
  const text = parsed.data.body || "📎 แนบไฟล์";
  const body = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  await notify(
    recipientIds.map((id) => ({ userId: id, url: target.url(id) })),
    { title: `${user.name} แสดงความคิดเห็น`, body: `${parsed.data.taskId ? `${target.label}: ` : ""}${body}`, url: target.url(target.ownerId) },
  );
  done();
  return { ok: "ส่งแล้ว", id: comment.id };
}

/** ลบได้: คนเขียนเอง หรือคนที่ดูแลทีมนั้น */
export async function deleteComment(formData: FormData) {
  const user = await requireUser();
  const comment = await prisma.comment.findUnique({
    where: { id: String(formData.get("id")) },
    include: { task: { select: { teamId: true, assigneeId: true } }, standup: { select: { teamId: true, userId: true } } },
  });
  if (!comment) return;
  if (comment.authorId !== user.id) {
    const target = comment.task
      ? { teamId: comment.task.teamId, ownerId: comment.task.assigneeId }
      : { teamId: comment.standup?.teamId ?? null, ownerId: comment.standup?.userId ?? "" };
    if (!(await teamAccess(user, target)).manage) return;
  }
  // ลบไฟล์แนบใน Storage ไปด้วย — ถ้า Storage มีปัญหา แถวที่เหลือจะถูก cron เก็บกวาดทีหลัง
  await purgeAttachments({ commentId: comment.id }).catch((e) => console.error(e));
  await prisma.comment.delete({ where: { id: comment.id } });
  done();
}
