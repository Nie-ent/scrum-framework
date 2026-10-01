import Link from "next/link";
import { keyToDate, todayKey } from "@/lib/dates";

const DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function DashboardCalendar({ dateKey, teamId, view }: { dateKey: string; teamId: string; view?: string }) {
  const selected = keyToDate(dateKey);
  const year = selected.getUTCFullYear();
  const month = selected.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = first.getUTCDay();
  const today = todayKey();
  const href = (day: number) => {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return `/dashboard?date=${key}${teamId ? `&team=${teamId}` : ""}${view ? `&view=${view}` : ""}`;
  };
  const monthLabel = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);

  return (
    <section className="card p-4" aria-label="ปฏิทินเลือกวันที่">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-slate-800">{monthLabel}</h2><span className="text-xs text-slate-400">เลือกวัน</span></div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {DAYS.map((day) => <span key={day} className="py-1 font-medium text-slate-400">{day}</span>)}
        {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
        {Array.from({ length: lastDay }, (_, index) => {
          const day = index + 1;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isFuture = key > today;
          const isSelected = key === dateKey;
          const classes = `flex h-8 w-8 items-center justify-center rounded-full ${isSelected ? "bg-indigo-600 font-semibold text-white" : key === today ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-600 hover:bg-slate-100"}`;
          return isFuture ? <span key={key} className="flex h-8 w-8 items-center justify-center text-slate-300">{day}</span> : <Link key={key} href={href(day)} aria-current={isSelected ? "date" : undefined} className={classes}>{day}</Link>;
        })}
      </div>
    </section>
  );
}
