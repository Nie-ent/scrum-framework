import { prisma } from "@/lib/db";
import { keyToDate, todayKey } from "@/lib/dates";
import { isPushConfigured, sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * เตือนคนที่ยังไม่ได้เช็กอินของวันนี้ — เรียกโดย Vercel Cron (ดู vercel.json)
 * หรือ cron ภายนอกพร้อม header `Authorization: Bearer $CRON_SECRET`
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) return Response.json({ error: "push not configured" }, { status: 503 });

  // คนที่เปิดแจ้งเตือนไว้ + ทีมที่อยู่ + เช็กอินของวันนี้
  const today = keyToDate(todayKey());
  const users = await prisma.user.findMany({
    where: { active: true, pushSubs: { some: {} }, memberships: { some: {} } },
    select: {
      id: true,
      pushSubs: true,
      memberships: { select: { team: { select: { id: true, name: true } } }, orderBy: { team: { name: "asc" } } },
      standups: { where: { date: today }, select: { teamId: true } },
    },
  });

  const totals = { users: 0, sent: 0, removed: 0, failed: 0 };
  for (const user of users) {
    const done = new Set(user.standups.map((s) => s.teamId));
    const missing = user.memberships.map((m) => m.team).filter((t) => !done.has(t.id));
    if (missing.length === 0) continue;

    const result = await sendPush(user.pushSubs, {
      title: "Pace — ยังไม่ได้เช็กอินวันนี้",
      body:
        missing.length === 1
          ? `ทีม ${missing[0].name} รออัปเดตจากคุณอยู่ ใช้เวลาแค่ 2 นาที`
          : `ยังไม่ได้เช็กอิน ${missing.length} ทีม: ${missing.map((t) => t.name).join(", ")}`,
      url: `/standup?team=${missing[0].id}`,
    });
    totals.users++;
    totals.sent += result.sent;
    totals.removed += result.removed;
    totals.failed += result.failed;
  }
  return Response.json({ ok: true, ...totals });
}
