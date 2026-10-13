import { taskReminders, weeklySummary } from "@/lib/automations";
import { keyToDate, todayKey } from "@/lib/dates";
import { GET as checkinReminder } from "../checkin-reminder/route";

export const dynamic = "force-dynamic";

/**
 * งานอัตโนมัติประจำวัน — เรียกโดย Vercel Cron วันละครั้งตอน 09:00 เวลาไทย (ดู vercel.json)
 * หรือ cron ภายนอกพร้อม header `Authorization: Bearer $CRON_SECRET`
 * ทุกวัน: เตือนกำหนดส่งของงาน · จันทร์–ศุกร์: เตือนคนที่ยังไม่เช็กอิน · ศุกร์: สรุปประจำสัปดาห์
 * แต่ละส่วนล้มเหลวได้โดยไม่ทำให้ส่วนอื่นไม่ทำงาน
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const weekday = keyToDate(todayKey()).getUTCDay();
  const attempt = async <T>(job: () => Promise<T>) => {
    try {
      return await job();
    } catch (e) {
      console.error(e);
      return { error: "failed" };
    }
  };
  const tasks = await attempt(taskReminders);
  const checkin = weekday >= 1 && weekday <= 5 ? await attempt(async () => (await checkinReminder(request)).json()) : null;
  const weekly = weekday === 5 ? await attempt(weeklySummary) : null;
  return Response.json({ ok: true, tasks, checkin, weekly });
}
