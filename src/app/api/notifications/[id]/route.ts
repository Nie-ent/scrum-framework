import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/** กดแจ้งเตือน: ทำเครื่องหมายว่าอ่านแล้ว แล้วพาไปหน้าที่แจ้งเตือนนั้นชี้ */
export async function GET(_: Request, { params }: RouteContext<"/api/notifications/[id]">) {
  const user = await getCurrentUser();
  const { id } = await params;
  let target = "/notifications";
  if (user && /^\d{1,18}$/.test(id)) {
    const row = await prisma.notification.findFirst({ where: { id: BigInt(id), userId: user.id } });
    if (row) {
      if (!row.readAt) await prisma.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
      // เปิดได้เฉพาะ path ภายในแอป
      if (row.url.startsWith("/") && !row.url.startsWith("//")) target = row.url;
    }
  }
  // Location แบบ relative: ใน standalone/Docker request.url เป็น host ภายใน ใช้สร้าง URL เต็มไม่ได้
  return new Response(null, { status: 307, headers: { Location: target, "Cache-Control": "no-store" } });
}
