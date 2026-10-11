/**
 * ไวยากรณ์ลิงก์ในโน้ต (ใช้ทั้งตอนบันทึกเพื่อเก็บความสัมพันธ์ และตอนแสดงผล)
 * - [[ชื่อโน้ต]] หรือ [[ชื่อโน้ต|ข้อความที่แสดง]] → ลิงก์ไปโน้ตในทีมเดียวกัน
 * - #12 → ลิงก์ไปงานเลข 12 ของทีม
 * ข้อความใน code (`...` และ ```...```) ไม่ถูกตีความเป็นลิงก์
 */
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;
const WIKI = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
const TASK_REF = /(^|[\s(])#(\d{1,6})(?![\w-])/g;

/** ใช้เทียบชื่อโน้ต: ไม่สนตัวพิมพ์และช่องว่างหัวท้าย */
export const noteKey = (title: string) => title.trim().toLowerCase();

const outsideCode = (content: string) => content.split(CODE).filter((_, i) => i % 2 === 0);

/** ชื่อโน้ตและเลขงานทั้งหมดที่เนื้อหานี้อ้างถึง */
export function extractLinks(content: string): { titles: string[]; taskNumbers: number[] } {
  const titles = new Map<string, string>();
  const taskNumbers = new Set<number>();
  for (const part of outsideCode(content)) {
    for (const m of part.matchAll(WIKI)) titles.set(noteKey(m[1]), m[1].trim());
    for (const m of part.matchAll(TASK_REF)) taskNumbers.add(Number(m[2]));
  }
  return { titles: [...titles.values()], taskNumbers: [...taskNumbers] };
}

const escapeLabel = (text: string) => text.replace(/([\[\]\\])/g, "\\$1");

/**
 * แปลงลิงก์ของเราเป็นลิงก์ Markdown ปกติก่อนส่งให้ตัวแสดงผล
 * โน้ตที่ยังไม่มี → ลิงก์ไปหน้าสร้างโน้ตชื่อนั้น (คลิกเพื่อสร้าง แบบ Obsidian)
 */
export function linkify(
  content: string,
  resolve: { noteId: (title: string) => string | undefined; taskUrl: (number: number) => string | undefined; newNoteUrl: (title: string) => string },
): string {
  return content
    .split(CODE)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(WIKI, (_, title: string, alias?: string) => {
          const id = resolve.noteId(title);
          const label = escapeLabel((alias ?? title).trim());
          return id ? `[${label}](/notes/${id})` : `[${label}](${resolve.newNoteUrl(title.trim())})`;
        })
        .replace(TASK_REF, (whole, before: string, number: string) => {
          const url = resolve.taskUrl(Number(number));
          return url ? `${before}[#${number}](${url})` : whole;
        });
    })
    .join("");
}

/** เปลี่ยนชื่อโน้ตในลิงก์ [[เก่า]] / [[เก่า|...]] ของเนื้อหา เป็นชื่อใหม่ */
export function renameLinks(content: string, oldTitle: string, newTitle: string): string {
  const key = noteKey(oldTitle);
  return content
    .split(CODE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(WIKI, (whole, title: string, alias?: string) => (noteKey(title) === key ? `[[${newTitle}${alias ? `|${alias}` : ""}]]` : whole)),
    )
    .join("");
}

/** ข้อความล้วนสั้น ๆ จากเนื้อหาโน้ต สำหรับแสดงในรายการ — ถ้ามีคำค้นจะตัดให้เห็นช่วงที่ตรง */
export function noteSnippet(content: string, q = ""): string {
  const plain = content
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/[#>*_`~|\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const at = q ? plain.toLowerCase().indexOf(q.toLowerCase()) : -1;
  const start = at > 60 ? at - 60 : 0;
  return (start > 0 ? "…" : "") + plain.slice(start, start + 160) + (plain.length > start + 160 ? "…" : "");
}
