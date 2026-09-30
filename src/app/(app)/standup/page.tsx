import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { dateToKey, formatDateKey, keyToDate, todayKey } from "@/lib/dates";
import { StandupSections } from "@/components/standup-card";
import { StandupForm } from "./standup-form";

export default async function StandupPage() {
  const user = await requireUser();
  const today = todayKey();

  const history = await prisma.standup.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 15,
  });
  const current = history.find((s) => dateToKey(s.date) === today);
  const previous = history.find((s) => s.date < keyToDate(today));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Daily Scrum</h1>
          <p className="text-sm text-slate-500">
            {formatDateKey(today)} · {current ? "ส่งแล้ว แก้ไขได้ตลอดวัน" : "ยังไม่ได้ส่งของวันนี้"}
          </p>
        </div>
        <StandupForm
          initial={{
            // ถ้ายังไม่ได้ส่ง ดึงแผน "วันนี้" ของครั้งก่อนมาเป็นตั้งต้นของ "ล่าสุดทำอะไรไป"
            yesterday: current?.yesterday ?? previous?.today ?? "",
            today: current?.today ?? "",
            blockers: current?.blockers ?? "",
            notWorking: current?.notWorking ?? "",
            workingWell: current?.workingWell ?? "",
          }}
          submitted={Boolean(current)}
        />
      </section>

      <aside>
        <h2 className="mb-3 font-semibold">ประวัติของฉัน</h2>
        <div className="space-y-3">
          {history.filter((s) => s !== current).map((s) => (
            <div key={s.id} className="card">
              <div className="mb-2 text-sm font-medium text-slate-500">{formatDateKey(dateToKey(s.date))}</div>
              <StandupSections standup={s} />
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}
        </div>
      </aside>
    </div>
  );
}
