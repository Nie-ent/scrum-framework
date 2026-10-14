/**
 * จุดยึดของความคิดเห็นในโน้ต (แบบ Google Docs) — เก็บข้อความที่เลือกพร้อมคำข้างหน้า/ข้างหลังเล็กน้อย
 * แล้วหาตำแหน่งใหม่ในข้อความที่แสดงทุกครั้งที่เปิดโน้ต จึงไม่ต้องใส่เครื่องหมายใด ๆ ลงในเนื้อโน้ต
 * ข้อความที่เทียบคือ "ข้อความที่ผู้อ่านเห็น" (หลังแปลง Markdown แล้ว) ไม่ใช่ Markdown ดิบ
 */
export type Anchor = { quote: string; prefix: string; suffix: string };

export const CONTEXT = 32;
export const MAX_QUOTE = 500;

export function makeAnchor(text: string, start: number, end: number): Anchor | null {
  const quote = text.slice(start, end);
  if (!quote.trim() || quote.length > MAX_QUOTE) return null;
  return { quote, prefix: text.slice(Math.max(0, start - CONTEXT), start), suffix: text.slice(end, end + CONTEXT) };
}

/** จำนวนตัวอักษรท้าย a ที่ตรงกับท้าย b */
const commonEnd = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};
/** จำนวนตัวอักษรต้น a ที่ตรงกับต้น b */
const commonStart = (a: string, b: string) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

/**
 * หาตำแหน่งของจุดยึดในข้อความปัจจุบัน — ข้อความที่เลือกต้องยังอยู่ครบ
 * ถ้าเจอหลายที่ เลือกที่คำรอบข้างตรงที่สุด · ไม่เจอ = null (ข้อความเดิมถูกแก้หรือลบ)
 */
export function locateAnchor(text: string, anchor: Anchor): { start: number; end: number } | null {
  if (!anchor.quote) return null;
  let best: { start: number; score: number } | null = null;
  for (let i = text.indexOf(anchor.quote); i >= 0; i = text.indexOf(anchor.quote, i + 1)) {
    const end = i + anchor.quote.length;
    const score = commonEnd(text.slice(Math.max(0, i - anchor.prefix.length), i), anchor.prefix) + commonStart(text.slice(end, end + anchor.suffix.length), anchor.suffix);
    if (!best || score > best.score) best = { start: i, score };
  }
  return best ? { start: best.start, end: best.start + anchor.quote.length } : null;
}
