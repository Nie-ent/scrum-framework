import { isDateKey, keyToDate, shiftKey } from "./dates";

/**
 * คำสั่งลัดที่พิมพ์ในแถบคำสั่ง (Cmd+K) — แยกด้วยรูปแบบตายตัว ไม่ใช้ AI จึงเร็ว ไม่มีค่าใช้จ่าย และทำนายผลได้
 * ไฟล์นี้ไม่แตะฐานข้อมูล ใช้ได้ทั้งในเบราว์เซอร์ (แสดงตัวอย่างก่อนกด Enter) และบนเซิร์ฟเวอร์ (ตรวจซ้ำก่อนทำจริง)
 */
export type Command =
  | { kind: "task"; title: string; due: string | null }
  | { kind: "note"; title: string }
  | { kind: "progress"; number: number; progress: number }
  | { kind: "due"; number: number; due: string | null }
  | { kind: "open"; number: number };

const WEEKDAYS: [RegExp, number][] = [
  [/^(อาทิตย์|sun(day)?)$/, 0],
  [/^(จันทร์|mon(day)?)$/, 1],
  [/^(อังคาร|tue(s|sday)?)$/, 2],
  [/^(พุธ|wed(nesday)?)$/, 3],
  [/^(พฤหัส|พฤหัสบดี|พฤหัสฯ|thu(r|rs|rsday)?)$/, 4],
  [/^(ศุกร์|fri(day)?)$/, 5],
  [/^(เสาร์|sat(urday)?)$/, 6],
];

/** แปลงคำบอกวัน ("พรุ่งนี้", "วันศุกร์", "ศุกร์หน้า", "next mon", "25/12", "2026-12-25") เป็น YYYY-MM-DD — อ่านไม่ออก = null */
export function parseDate(raw: string, today: string): string | null {
  const text = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isValid(text) ? text : null;
  if (/^(วันนี้|today)$/.test(text)) return today;
  if (/^(พรุ่งนี้|วันพรุ่งนี้|tomorrow|tmr)$/.test(text)) return shiftKey(today, 1);
  if (/^(มะรืน|มะรืนนี้|วันมะรืน)$/.test(text)) return shiftKey(today, 2);
  if (/^(สัปดาห์หน้า|อาทิตย์หน้า|next week)$/.test(text)) return shiftKey(today, 7);

  // วันในสัปดาห์ = วันนั้นครั้งถัดไป (ไม่นับวันนี้) · "หน้า"/"next" = ข้ามไปอีกสัปดาห์
  const next = /^next /.test(text) || /หน้า$/.test(text);
  const name = text.replace(/^next /, "").replace(/^วัน/, "").replace(/(นี้|หน้า)$/, "").trim();
  const weekday = WEEKDAYS.find(([pattern]) => pattern.test(name));
  if (weekday) {
    const ahead = (weekday[1] - keyToDate(today).getUTCDay() + 7) % 7 || 7;
    return shiftKey(today, ahead + (next ? 7 : 0));
  }

  // 25/12 หรือ 25/12/2026 (ปี พ.ศ. ก็ได้) — ไม่ใส่ปี = วันนั้นครั้งถัดไป
  const parts = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(text);
  if (parts) {
    const pad = (n: string) => n.padStart(2, "0");
    let year = parts[3] ? Number(parts[3]) : Number(today.slice(0, 4));
    if (parts[3] && parts[3].length === 2) year += 2000;
    if (year > 2400) year -= 543;
    let key = `${year}-${pad(parts[2])}-${pad(parts[1])}`;
    if (!parts[3] && isValid(key) && key < today) key = `${year + 1}-${pad(parts[2])}-${pad(parts[1])}`;
    return isValid(key) ? key : null;
  }
  return null;
}

/** กัน 31/02 ที่ Date.parse ยอมให้ผ่านโดยเลื่อนไปเดือนถัดไป */
const isValid = (key: string) => isDateKey(key) && keyToDate(key).toISOString().slice(0, 10) === key;

const CLEAR = /^(ไม่กำหนด|ไม่มีกำหนด|ล้าง|none|clear|-)$/i;

/** แยกคำสั่งจากข้อความที่พิมพ์ — ไม่ตรงรูปแบบใดเลย = null (ถือเป็นคำค้นธรรมดา) */
export function parseCommand(raw: string, today: string): Command | null {
  const text = raw.trim().replace(/\s+/g, " ");
  let m: RegExpExecArray | null;

  if ((m = /^#(\d{1,6})$/.exec(text))) return { kind: "open", number: Number(m[1]) };

  // #12 80% · #12 เสร็จ · เสร็จ #12
  if ((m = /^#(\d{1,6}) (\d{1,3}) ?%?$/.exec(text)) && Number(m[2]) <= 100) return { kind: "progress", number: Number(m[1]), progress: Number(m[2]) };
  if ((m = /^#(\d{1,6}) (?:เสร็จ|เสร็จแล้ว|done|finished)$/i.exec(text) ?? /^(?:เสร็จ|เสร็จแล้ว|done|finish) #(\d{1,6})$/i.exec(text))) return { kind: "progress", number: Number(m[1]), progress: 100 };

  // เลื่อน #12 ไปวันศุกร์ · #12 ส่ง พรุ่งนี้ · due #12 fri
  m = /^(?:เลื่อน|ย้าย|กำหนดส่ง|due|move) ?#(\d{1,6}) ?(?:ไปเป็น|ไป|เป็น|to|=)? ?(.+)$/i.exec(text) ?? /^#(\d{1,6}) (?:ส่ง|เลื่อนไป|กำหนดส่ง|due|by) ?(.+)$/i.exec(text);
  if (m) {
    if (CLEAR.test(m[2].trim())) return { kind: "due", number: Number(m[1]), due: null };
    const due = parseDate(m[2], today);
    return due ? { kind: "due", number: Number(m[1]), due } : null;
  }

  // สร้างงาน เขียนรายงาน ส่ง พรุ่งนี้ — วันกำหนดส่งต้องมีคำนำ (ส่ง/ภายใน/due/by/@) ชื่องานจึงลงท้ายด้วยชื่อวันได้
  if ((m = /^(?:สร้างงาน|เพิ่มงาน|งานใหม่|new task|add task|task)[ :]+(.+)$/i.exec(text))) {
    const tail = /^(.+?)(?: (?:ส่ง|ภายใน|กำหนดส่ง|due|by) ?| @)(.+)$/i.exec(m[1]);
    const due = tail ? parseDate(tail[2], today) : null;
    const title = (due ? tail![1] : m[1]).trim();
    return title ? { kind: "task", title: title.slice(0, 200), due } : null;
  }

  if ((m = /^(?:สร้างโน้ต|เพิ่มโน้ต|โน้ตใหม่|new note|add note|note)[ :]+(.+)$/i.exec(text))) return { kind: "note", title: m[1].trim() };
  return null;
}
