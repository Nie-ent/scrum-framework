import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { teamAccess } from "@/lib/access";
import { createDownloadUrl, isFileStorageConfigured } from "@/lib/file-store";

/** เปิด/ดาวน์โหลดไฟล์แนบ — ตรวจสิทธิ์แล้วส่งต่อไปที่ signed URL อายุสั้นของ Storage (?download=1 = บังคับดาวน์โหลด) */
export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await params;
  const file = await prisma.attachment.findUnique({
    where: { id },
    include: {
      task: { select: { teamId: true, assigneeId: true } },
      comment: {
        select: { task: { select: { teamId: true, assigneeId: true } }, standup: { select: { teamId: true, userId: true } } },
      },
    },
  });
  const task = file?.task ?? file?.comment?.task;
  const standup = file?.comment?.standup;
  const target = task ? { teamId: task.teamId, ownerId: task.assigneeId } : standup ? { teamId: standup.teamId, ownerId: standup.userId } : null;
  const expired = file && !file.importantAt && file.expiresAt <= new Date();
  if (!file || !file.uploadedAt || expired || !target || !isFileStorageConfigured()) return new Response("ไม่พบไฟล์ หรือไฟล์หมดอายุแล้ว", { status: 404 });
  if (!(await teamAccess(user, target)).read) return new Response(null, { status: 403 });

  const download = new URL(request.url).searchParams.has("download");
  const url = await createDownloadUrl(file.path, download ? file.name : undefined);
  if (!url) return new Response("ไม่พบไฟล์", { status: 404 });
  return new Response(null, { status: 307, headers: { Location: url, "Cache-Control": "no-store" } });
}
