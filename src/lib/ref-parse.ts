import { extractLinks } from "./note-links";
import { findMentions, type Person } from "./mentions";

/**
 * ไวยากรณ์อ้างอิงชุดเดียวกันทั้งระบบ: #12 = งาน · [[ชื่อโน้ต]] = โน้ต · @ชื่อ = คน
 * ใช้กับรายละเอียดงาน ความคิดเห็น เช็กอิน และเนื้อโน้ต (ไม่แตะฐานข้อมูล ใช้ได้ทั้งสองฝั่ง)
 */
export function extractRefs(text: string, people: Person[]) {
  const { targets, taskNumbers } = extractLinks(text);
  return { taskNumbers, noteTargets: targets, userIds: [...new Set(findMentions(text, people).map((m) => m.userId))] };
}

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "url"; text: string; href: string }
  | { kind: "task"; text: string; number: number }
  | { kind: "note"; text: string; target: string }
  | { kind: "mention"; text: string; userId: string };

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const WIKI_RE = /\[\[([^\[\]|\n]+?)(?:\\?\|([^\[\]\n]+?))?\]\]/g;
const TASK_RE = /(^|[^\p{L}\p{N}_/#&=\\\[])#(\d{1,6})(?![\w-])/gu;

/**
 * แยกข้อความธรรมดาเป็นชิ้นสำหรับแสดงผล: ลิงก์เว็บ, #งาน, [[โน้ต]], @คน และข้อความทั่วไป
 * tasks/notes ที่ส่งมา = เฉพาะที่มีอยู่จริง (ที่ไม่มีแสดงเป็นข้อความธรรมดา)
 */
export function segmentRefs(text: string, ctx: { people: Person[]; taskNumbers: Set<number>; noteKnown: (target: string) => boolean }): Segment[] {
  type Hit = { start: number; end: number; seg: Segment };
  const hits: Hit[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const href = m[0].replace(/[.,;:!?)\]]+$/, "");
    hits.push({ start: m.index, end: m.index + href.length, seg: { kind: "url", text: href, href } });
  }
  const free = (start: number, end: number) => !hits.some((h) => start < h.end && end > h.start);
  for (const m of text.matchAll(WIKI_RE)) {
    if (!ctx.noteKnown(m[1].trim()) || !free(m.index, m.index + m[0].length)) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, seg: { kind: "note", text: (m[2] ?? m[1]).trim(), target: m[1].trim() } });
  }
  for (const m of text.matchAll(TASK_RE)) {
    const start = m.index + m[1].length;
    const end = start + 1 + m[2].length;
    if (!ctx.taskNumbers.has(Number(m[2])) || !free(start, end)) continue;
    hits.push({ start, end, seg: { kind: "task", text: `#${m[2]}`, number: Number(m[2]) } });
  }
  for (const m of findMentions(text, ctx.people)) {
    if (free(m.start, m.end)) hits.push({ start: m.start, end: m.end, seg: { kind: "mention", text: `@${m.name}`, userId: m.userId } });
  }
  hits.sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.start > at) out.push({ kind: "text", text: text.slice(at, h.start) });
    out.push(h.seg);
    at = h.end;
  }
  if (at < text.length) out.push({ kind: "text", text: text.slice(at) });
  return out;
}
