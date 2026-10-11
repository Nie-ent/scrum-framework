import Link from "next/link";
import { keyToDate, todayKey } from "@/lib/dates";
import { dayTone, holidayName, isWeekend } from "@/lib/holidays";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const Chevron = ({ left = false }: { left?: boolean }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" className={`size-4 ${left ? "rotate-180" : ""}`} aria-hidden="true">
    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
  </svg>
);
const DOT = { full: "bg-success", partial: "bg-warning", none: "bg-danger" } as const;

/**
 * ปฏิทินของหน้าภาพรวม: กดวันเพื่อดูวันนั้น
 * จุดใต้วัน = สถานะเช็กอินของทีม (เขียว ครบ · เหลือง ไม่ครบ · แดง ไม่มีใครส่ง) — วันหยุดที่ไม่มีใครส่งไม่ขึ้นจุด
 * ตัวเลขสีฟ้า = วันหยุดนักขัตฤกษ์ · สีแดง = เสาร์–อาทิตย์ · ลูกศร = เปลี่ยนเดือนที่แสดง
 */
export function DashboardCalendar({ dateKey, monthKey, teamId, view, submitted = {}, expected = 0 }: { dateKey: string; /** เดือนที่แสดง YYYY-MM */ monthKey: string; teamId: string; view?: string; submitted?: Record<string, number>; expected?: number }) {
  const shown = keyToDate(`${monthKey}-01`);
  const year = shown.getUTCFullYear();
  const month = shown.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = todayKey();
  const keyOf = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const rest = `${teamId ? `&team=${teamId}` : ""}${view ? `&view=${view}` : ""}`;
  const href = (key: string) => `/dashboard?date=${key}${rest}`;
  // เปลี่ยนเดือนที่แสดงโดยคงวันที่กำลังดูไว้
  const monthHref = (delta: number) => `/dashboard?date=${dateKey}&month=${new Date(Date.UTC(year, month + delta, 1)).toISOString().slice(0, 7)}${rest}`;
  const canNext = monthKey < today.slice(0, 7);
  const arrow = "flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground";
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
      <div className="mb-3 flex items-center gap-1">
        <h2 className="min-w-0 flex-1 truncate font-semibold text-foreground">{monthLabel}</h2>
        {dateKey !== today && <Link href={href(today)} scroll={false} className="rounded-full px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-primary-soft">วันนี้</Link>}
        <Link href={monthHref(-1)} scroll={false} aria-label="เดือนก่อนหน้า" className={arrow}><Chevron left /></Link>
        {canNext ? <Link href={monthHref(1)} scroll={false} aria-label="เดือนถัดไป" className={arrow}><Chevron /></Link> : <span aria-hidden="true" className={`${arrow} pointer-events-none opacity-30`}><Chevron /></span>}
      </div>
      <div className="grid grid-cols-7 justify-items-center gap-y-1 text-center text-xs">
        {DAYS.map((day, i) => <span key={day} className={`py-1 font-medium ${i === 0 || i === 6 ? "text-danger" : "text-subtle"}`}>{day}</span>)}
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
            <Link key={key} href={href(key)} scroll={false} title={label} aria-label={`${day} ${monthLabel}${label ? ` ${label}` : ""}`} aria-current={isSelected ? "date" : undefined} className="group flex flex-col items-center gap-0.5">{body}</Link>
          );
        })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-2xs text-muted-foreground">
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-success" />ส่งครบ</li>
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-warning" />ไม่ครบ</li>
        <li className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />ไม่มีใครส่ง</li>
        <li className="text-danger">เสาร์–อาทิตย์</li>
        <li className="text-sky-600">นักขัตฤกษ์</li>
      </ul>
      {holidays.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {holidays.map((h) => <li key={h.key}><span className="font-semibold tabular-nums text-sky-600">{Number(h.key.slice(8))}</span> {h.name}</li>)}
        </ul>
      )}
    </section>
  );
}
