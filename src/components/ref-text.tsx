import Link from "next/link";
import { noteKey } from "@/lib/note-links";
import { segmentRefs } from "@/lib/ref-parse";
import type { Person } from "@/lib/mentions";

/**
 * ข้อมูลของพื้นที่ที่ใช้แสดง #งาน [[โน้ต]] @คน เป็นป้ายที่กดได้ (ใช้ได้ทั้ง server และ client component)
 * — ส่งเฉพาะที่จำเป็น: งาน/โน้ตที่มีอยู่จริงในพื้นที่ และคนที่แท็กได้
 */
export type RefContext = {
  teamId: string;
  people: Person[];
  tasks: { number: number; title: string; progress: number; assignee?: string }[];
  notes: { id: string; title: string }[];
};

const chip = "rounded-md px-1 py-px font-medium";

/** ข้อความธรรมดา (ความคิดเห็น รายละเอียดงาน เช็กอิน) ที่ลิงก์เว็บ #งาน [[โน้ต]] @คน กดได้ — ชี้แล้วเห็นรายละเอียดสั้น ๆ */
export function RefText({ text, ctx }: { text: string; ctx?: RefContext | null }) {
  const tasks = new Map((ctx?.tasks ?? []).map((t) => [t.number, t]));
  const notes = new Map((ctx?.notes ?? []).map((n) => [noteKey(n.title), n]));
  const noteOf = (target: string) => notes.get(noteKey(target.split("#")[0].split("/").pop() ?? target));
  const segments = segmentRefs(text, { people: ctx?.people ?? [], taskNumbers: new Set(tasks.keys()), noteKnown: (t) => Boolean(noteOf(t)) });
  return (
    <>
      {segments.map((s, i) => {
        if (s.kind === "text") return s.text;
        if (s.kind === "url") {
          return (
            <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline underline-offset-2 hover:text-primary-strong">
              {s.text}
            </a>
          );
        }
        if (s.kind === "task") {
          const t = tasks.get(s.number)!;
          return (
            <Link key={i} href={`/tasks?team=${ctx!.teamId}&task=${s.number}`} scroll={false} title={`#${t.number} ${t.title} · ${t.progress}%${t.assignee ? ` · ${t.assignee}` : ""}`} className={`${chip} bg-primary-soft text-primary-strong hover:underline`}>
              {s.text}
            </Link>
          );
        }
        if (s.kind === "note") {
          const n = noteOf(s.target)!;
          return (
            <Link key={i} href={`/notes/${n.id}`} title={n.title} className={`${chip} bg-surface-sunken text-primary hover:underline`}>
              {s.text}
            </Link>
          );
        }
        return (
          <span key={i} className={`${chip} bg-warning-soft text-foreground`} data-user={s.userId}>
            {s.text}
          </span>
        );
      })}
    </>
  );
}
