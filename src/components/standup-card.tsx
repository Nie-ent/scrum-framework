import type { Standup } from "@prisma/client";
import { toTasks } from "@/lib/tasks";

export const TASK_SECTIONS = [
  { key: "yesterdayTasks", label: "ล่าสุดทำอะไรไป", hint: "Yesterday", tone: "slate" },
  { key: "todayTasks", label: "วันนี้จะทำอะไร", hint: "Today", tone: "indigo" },
] as const;

export const TEXT_SECTIONS = [
  { key: "blockers", label: "ต้องการความช่วยเหลือ", hint: "Blocker", tone: "red" },
  { key: "notWorking", label: "สิ่งที่ควรปรับปรุง", hint: "Reflection", tone: "amber" },
  { key: "workingWell", label: "สิ่งที่ไปได้ดี", hint: "Reflection", tone: "emerald" },
] as const;

export type TaskSectionKey = (typeof TASK_SECTIONS)[number]["key"];
export type TextSectionKey = (typeof TEXT_SECTIONS)[number]["key"];
type SectionKey = TaskSectionKey | TextSectionKey;

const TONES = {
  slate: "border-slate-300 bg-slate-50/50",
  indigo: "border-indigo-400 bg-indigo-50/50",
  red: "border-rose-400 bg-rose-50/70",
  amber: "border-amber-400 bg-amber-50/70",
  emerald: "border-emerald-400 bg-emerald-50/70",
} as const;

export function TaskListView({ value, showStatus = false }: { value: unknown; showStatus?: boolean }) {
  const tasks = toTasks(value);
  if (tasks.length === 0) return <p className="text-sm text-slate-400">—</p>;
  return (
    <ul className="space-y-0.5 text-sm">
      {tasks.map((t, i) => (
        <li key={i} className="flex gap-2">
          {showStatus ? (
            <span className={t.done ? "text-emerald-600" : "text-slate-400"} aria-label={t.done ? "เสร็จแล้ว" : "ยังไม่เสร็จ"}>
              {t.done ? "✓" : "○"}
            </span>
          ) : (
            <span className="text-indigo-400" aria-hidden="true">•</span>
          )}
          <span className={showStatus && !t.done ? "text-slate-500" : ""}>{t.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function StandupSections({
  standup,
  only,
}: {
  standup: Pick<Standup, SectionKey>;
  only?: readonly SectionKey[];
}) {
  const show = (key: SectionKey) => !only || only.includes(key);
  return (
    <div className="space-y-2">
      {TASK_SECTIONS.filter((s) => show(s.key)).map((s) => (
        <div key={s.key} className={`rounded-r-lg border-l-4 py-1 pl-3 pr-2 ${TONES[s.tone]}`}>
          <div className="mb-0.5 text-xs font-medium text-slate-500">
            {s.label} <span className="text-slate-400">· {s.hint}</span>
          </div>
          <TaskListView value={standup[s.key]} showStatus={s.key === "yesterdayTasks"} />
        </div>
      ))}
      {TEXT_SECTIONS.filter((s) => show(s.key) && standup[s.key]).map((s) => (
        <div key={s.key} className={`rounded-r-lg border-l-4 py-1 pl-3 pr-2 ${TONES[s.tone]}`}>
          <div className="text-xs font-medium text-slate-500">
            {s.label} <span className="text-slate-400">· {s.hint}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{standup[s.key]}</p>
        </div>
      ))}
    </div>
  );
}
