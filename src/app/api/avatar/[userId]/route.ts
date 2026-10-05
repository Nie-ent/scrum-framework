import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** รูปโปรไฟล์ — เห็นได้เฉพาะคนที่ login แล้ว · URL มี ?v=เวลาอัปเดต จึง cache ได้ยาว */
export async function GET(_: Request, { params }: RouteContext<"/api/avatar/[userId]">) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const { userId } = await params;
  const avatar = await prisma.avatar.findUnique({ where: { userId } });
  if (!avatar) return new Response(null, { status: 404 });
  return new Response(avatar.data, {
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
