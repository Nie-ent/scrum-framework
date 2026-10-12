import { en } from "./en";

/**
 * ระบบภาษาของ Pace: ข้อความต้นฉบับในโค้ดเป็นภาษาไทย และใช้ข้อความไทยนั้นเป็น "คีย์" หาคำแปล
 * ไม่มีคำแปล = แสดงข้อความไทยเดิม (ไม่พัง แค่ยังไม่ได้แปล) — เพิ่มคำแปลที่ ./en.ts
 * ตัวแปรในข้อความเขียนเป็น {0} {1} … เช่น tr("ค้างอยู่ {0} งาน", [n])
 */
export type Lang = "th" | "en";
export const LANG_COOKIE = "pace_lang";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "th", label: "ไทย" },
  { id: "en", label: "English" },
];
export const isLang = (value: unknown): value is Lang => value === "th" || value === "en";

export type Vars = readonly (string | number)[];
export type Translate = (text: string, vars?: Vars) => string;

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\d+)\}/g, (whole, i) => (vars[Number(i)] === undefined ? whole : String(vars[Number(i)]))) : text);

/** ภาษาอังกฤษ: "1 tasks" → "1 task" สำหรับคำนับที่ใช้ในแอป */
const SINGULAR: Record<string, string> = { tasks: "task", days: "day", files: "file", items: "item", notes: "note", devices: "device", times: "time", workdays: "workday", "check-ins": "check-in", people: "person", folders: "folder", invitations: "invitation" };
const one = (text: string) => text.replace(/(^|[^\d.,])1 (tasks|days|files|items|notes|devices|times|workdays|check-ins|people|folders|invitations)\b/g, (_, before, word) => `${before}1 ${SINGULAR[word]}`);

export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (lang === "th") return fill(text, vars);
  const hit = en[text];
  if (hit !== undefined) return one(fill(hit, vars));
  // ข้อความที่มีช่องว่างหัวท้าย: หาคำแปลของส่วนกลาง แล้วคืนช่องว่างเดิม
  const core = text.trim();
  const inner = core === text ? undefined : en[core];
  return one(fill(inner === undefined ? text : text.replace(core, inner), vars));
}

/** locale ของ Intl สำหรับวันที่และตัวเลข */
export const localeOf = (lang: Lang) => (lang === "th" ? "th-TH" : "en-GB");
