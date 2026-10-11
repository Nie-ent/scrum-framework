import "server-only";
import { keyToDate } from "./dates";
import { currentLocale } from "./i18n/server";

const TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Bangkok";

/** วันที่แบบอ่านง่ายตามภาษาที่ใช้อยู่ เช่น "อา. 11 ต.ค. 2569" / "Sun, 11 Oct 2026" */
export function formatDateKey(key: string): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(keyToDate(key));
}

/** เวลาที่โพสต์ เช่น "8 ต.ค. 14:05" ตาม timezone ของทีม */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).format(date);
}
