import { getCurrentUser } from "@/lib/auth";
import { loadAvatarImage } from "@/lib/avatar-store";

/** รูปโปรไฟล์ — เห็นได้เฉพาะคนที่ login แล้ว · URL มี ?v=เวลาอัปเดต จึง cache ได้ยาว */
export async function GET(_: Request, { params }: RouteContext<"/api/avatar/[userId]">) {
  if (!(await getCurrentUser())) return new Response(null, { status: 401 });
  const { userId } = await params;
  const avatar = await loadAvatarImage(userId);
  if (!avatar) return new Response(null, { status: 404 });
  return new Response(new Blob([avatar.data], { type: avatar.mimeType }), {
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
