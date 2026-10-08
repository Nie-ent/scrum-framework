import type { Prisma } from "@prisma/client";
import { withAttachments } from "./attachments";

/** ใช้กับ include ของ Task / Standup เพื่อดึงความคิดเห็นพร้อมผู้เขียน เรียงเก่า → ใหม่ */
export const withComments = {
  orderBy: { createdAt: "asc" },
  select: {
    id: true,
    body: true,
    createdAt: true,
    author: { select: { id: true, name: true, avatarUpdatedAt: true } },
    attachments: withAttachments,
  },
} satisfies Prisma.CommentFindManyArgs;

export type CommentRow = Prisma.CommentGetPayload<typeof withComments>;

/** ความคิดเห็นอยู่ใต้งาน หรือใต้เช็กอิน */
export type CommentTarget = { taskId: string } | { standupId: string };
