const TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Bangkok";

/** วันที่ปัจจุบันตาม timezone ของทีม ในรูป YYYY-MM-DD */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value));
}

/** แปลง YYYY-MM-DD เป็น Date (UTC เที่ยงคืน) สำหรับคอลัมน์ @db.Date */
export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

export function dateToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToKey(d);
}

export function formatDateKey(key: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(keyToDate(key));
}
