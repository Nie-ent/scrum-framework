import Link from "next/link";
import { keyToDate, todayKey } from "@/lib/dates";
import { dayTone, holidayName, isWeekend } from "@/lib/holidays";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DOT = { full: "bg-success", partial: "bg-warning", none: "bg-danger" } as const;

/**
 * ปฏิทินของหน้าภาพรวม: กดวันเพื่อดูวันนั้น
 * จุดใต้วัน = สถานะเช็กอินของทีม (เขียว ครบ · เหลือง ไม่ครบ · แดง ไม่มีใครส่ง) — วันหยุดที่ไม่มีใครส่งไม่ขึ้นจุด
 * ตัวเลขสีแดง = วันหยุดนักขัตฤกษ์ · สีฟ้า = เสาร์–อาทิตย์
 */
export function DashboardCalendar({ dateKey, teamId, view, submitted = {}, expected = 0 }: { dateKey: string; teamId: string; view?: string; submitted?: Record<string, number>; expected?: number }) {
  const selected = keyToDate(dateKey);
  const year = selected.getUTCFullYear();
  const month = selected.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = todayKey();
  const keyOf = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const href = (key: string) => `/dashboard?date=${key}${teamId ? `&team=${teamId}` : ""}${view ? `&view=${view}` : ""}`;
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const status = (key: string) => {
    if (key > today || expected === 0) return null;
    const count = submitted[key] ?? 0;
    if (count >= expected) return "full" as const;
    if (count > 0) return "partial" as const;
    return holidayName(key) || isWeekend(key) ? null : ("none" as const);
  };
  const days = Array.from({ length: lastDay }, (_, i) => keyOf(i + 1));
  const holidays = days.flatMap((key) => (holidayName(key) ? [{ key, name: holidayName(key)! }] : []));

  return (
    <section className="card p-4" aria-label="ปฏิทินเลือกวันที่">
      <h2 className="mb-3 font-semibold text-foreground">{monthLabel}</h2>
      <div className="grid grid-cols-7 justify-items-center gap-y-1 text-center text-xs">
        {DAYS.map((day, i) => <span key={day} className={`py-1 font-medium ${i === 0 || i === 6 ? "text-sky-600" : "text-subtle"}`}>{day}</span>)}
        {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((key) => {
          const day = Number(key.slice(8));
          const isSelected = key === dateKey;
          const state = status(key);
          const holiday = holidayName(key);
          const count = submitted[key] ?? 0;
          const label = [holiday, state ? `เช็กอิน ${count}/${expected}` : null].filter(Boolean).join(" · ") || undefined;
          const body = (
            <>
              <span className={`flex size-7 items-center justify-center rounded-full tabular-nums transition ${isSelected ? "bg-primary font-semibold text-primary-foreground" : `${dayTone(key)} ${key === today ? "bg-primary-soft font-semibold" : ""} group-hover:bg-surface-sunken`}`}>{day}</span>
              <span className={`size-1.5 rounded-full ${state ? DOT[state] : "bg-transparent"}`} />
            </>
          );
          return key > today ? (
            <span key={key} title={label} className="flex flex-col items-center gap-0.5 opacity-40">{body}</span>
          ) : (
            <Link key={key} href={href(key)} title={label} aria-label={`${day} ${monthLabel}${label ? ` ${label}` : ""}`} aria-current={isSelected ? "date" : undefined} className="group flex flex-col items-center gap-0.5">{body}</Link>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-success" />ส่งครบ</li>
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" />ไม่ครบ</li>
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />ไม่มีใครส่ง</li>
        <li className="text-danger">นักขัตฤกษ์</li>
        <li className="text-sky-600">เสาร์–อาทิตย์</li>
      </ul>
      {holidays.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {holidays.map((h) => <li key={h.key}><span className="font-semibold tabular-nums text-danger">{Number(h.key.slice(8))}</span> {h.name}</li>)}
        </ul>
      )}
    </section>
  );
}
