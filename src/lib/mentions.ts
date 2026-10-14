/**
 * การแท็กคนด้วย @ชื่อ — เก็บเป็นข้อความธรรมดาที่อ่านรู้เรื่อง (ไม่มี id ปน) แล้วจับคู่กับสมาชิกของพื้นที่ตอนบันทึก/แสดงผล
 * ชื่อมีช่องว่างได้ ("@ก้อง สุขใจ") จึงเลือกชื่อที่ยาวที่สุดที่ตรง · ภาษาไทยไม่เว้นวรรค จึงให้ชื่อต่อด้วยตัวอักษรไทยได้
 * ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์ (ไม่แตะฐานข้อมูล)
 */
export type Person = { id: string; name: string };
export type Mention = { start: number; end: number; userId: string; name: string };

// ก่อน @ ต้องไม่ใช่ตัวอักษร/ตัวเลข/จุด — กันอีเมล (a@b.com) ไม่ให้นับเป็นการแท็ก
const BEFORE = /[\p{L}\p{N}._%+-]/u;
// หลังชื่อเป็นตัวอักษรละติน/ตัวเลข = เป็นคำอื่นที่ขึ้นต้นเหมือนชื่อ (เช่น @Ann กับ Anna)
const AFTER = /[A-Za-z0-9_]/;

export function findMentions(text: string, people: Person[]): Mention[] {
  if (!text.includes("@") || people.length === 0) return [];
  const sorted = people.filter((p) => p.name.trim()).sort((a, b) => b.name.length - a.name.length);
  const lower = text.toLowerCase();
  const found: Mention[] = [];
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (i > 0 && BEFORE.test(text[i - 1])) continue;
    const person = sorted.find((p) => {
      const name = p.name.trim().toLowerCase();
      return lower.startsWith(name, i + 1) && !AFTER.test(text[i + 1 + name.length] ?? "");
    });
    if (!person) continue;
    const end = i + 1 + person.name.trim().length;
    found.push({ start: i, end, userId: person.id, name: person.name.trim() });
    i = end - 1;
  }
  return found;
}

/** id ของคนที่ถูกแท็ก (ไม่ซ้ำ) */
export const mentionedIds = (text: string, people: Person[]) => [...new Set(findMentions(text, people).map((m) => m.userId))];
