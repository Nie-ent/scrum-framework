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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section>
        <div className="page-header mb-6">
          <div>
            <p className="eyebrow">Daily rhythm</p>
            <h1 className="page-title">Daily Scrum</h1>
            <p className="page-subtitle">{formatDateKey(today)} · {current ? "ส่งแล้ว และแก้ไขได้ตลอดวัน" : "ยังไม่ได้ส่งของวันนี้"}</p>
          </div>
          <span className={`badge ${current ? "badge-success" : "badge-warning"}`}>{current ? "✓ เช็กอินแล้ว" : "รอเช็กอิน"}</span>
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

      <aside className="xl:border-l xl:border-slate-200 xl:pl-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">ประวัติของฉัน</h2>
          <span className="badge badge-neutral">15 รายการล่าสุด</span>
        </div>
        <div className="space-y-3">
          {history.filter((s) => s !== current).map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-medium text-slate-500"><span>{formatDateKey(dateToKey(s.date))}</span><span className="h-2 w-2 rounded-full bg-emerald-500" aria-label="ส่งแล้ว" /></div>
              <StandupSections standup={s} />
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}
        </div>
      </aside>
    </div>
  );
}
