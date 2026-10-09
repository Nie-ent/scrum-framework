import type { Standup } from "@prisma/client";
import { averageProgress, isDone, toTasks } from "@/lib/tasks";

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

export function ProgressBar({ percent, className = "" }: { percent: number; className?: string }) {
  return (
    <span
      className={`inline-block h-1.5 overflow-hidden rounded-full bg-slate-200 align-middle ${className}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={`block h-full rounded-full ${percent >= 100 ? "bg-emerald-500" : "bg-indigo-500"}`} style={{ width: `${percent}%` }} />
    </span>
  );
}

/** รายการยาวเกินนี้จะพับส่วนที่เหลือไว้ เพื่อให้การ์ดเช็กอินอ่านง่ายเมื่อมีงานเยอะ */
const VISIBLE_TASKS = 5;

/** showStatus = แสดง ✓/○ และ % ของแต่ละ task (ใช้กับ "ล่าสุดทำอะไรไป") */
export function TaskListView({ value, showStatus = false }: { value: unknown; showStatus?: boolean }) {
  const tasks = toTasks(value);
  if (tasks.length === 0) return <p className="text-sm text-slate-400">—</p>;
  const row = (t: (typeof tasks)[number], i: number) => {
    const percent = t.progress ?? 0;
    return (
      <li key={i} className="flex gap-2">
        {showStatus ? (
          <span className={isDone(t) ? "text-emerald-600" : "text-slate-400"} aria-hidden="true">
            {isDone(t) ? "✓" : "○"}
          </span>
        ) : (
          <span className="text-indigo-400" aria-hidden="true">•</span>
        )}
        <span className={`min-w-0 flex-1 break-words ${showStatus && isDone(t) ? "text-slate-500" : ""}`}>{t.text}</span>
        {showStatus ? (
          <span className={`shrink-0 text-xs tabular-nums ${isDone(t) ? "text-emerald-600" : "text-slate-500"}`}>{percent}%</span>
        ) : (
          percent > 0 && <span className="shrink-0 text-xs text-slate-400">ทำต่อจาก {percent}%</span>
        )}
      </li>
    );
  };
  // งานที่ยังไม่เสร็จขึ้นก่อน — เป็นส่วนที่คนอ่านต้องการเห็นที่สุด
  const ordered = showStatus ? [...tasks.filter((t) => !isDone(t)), ...tasks.filter(isDone)] : tasks;
  const head = ordered.slice(0, VISIBLE_TASKS);
  const rest = ordered.slice(VISIBLE_TASKS);
  const doneInRest = rest.filter(isDone).length;
  return (
    <>
      <ul className="space-y-0.5 text-sm">{head.map(row)}</ul>
      {rest.length > 0 && (
        <details className="group/more text-sm">
          <summary className="mt-0.5 cursor-pointer list-none text-xs font-medium text-indigo-600 marker:hidden hover:text-indigo-800">
            <span className="group-open/more:hidden">+ อีก {rest.length} งาน{showStatus && doneInRest > 0 && ` (เสร็จแล้ว ${doneInRest})`}</span>
            <span className="hidden group-open/more:inline">ย่อรายการ</span>
          </summary>
          <ul className="mt-0.5 space-y-0.5">{rest.map((t, i) => row(t, i + VISIBLE_TASKS))}</ul>
        </details>
      )}
    </>
  );
}

/** สรุป % เฉลี่ยของงานใน "ล่าสุดทำอะไรไป" */
export function ProgressSummary({ value, className = "w-20" }: { value: unknown; className?: string }) {
  const percent = averageProgress(toTasks(value));
  if (percent === null) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <ProgressBar percent={percent} className={className} />
      <span className={`text-xs font-semibold tabular-nums ${percent >= 100 ? "text-emerald-600" : "text-slate-600"}`}>{percent}%</span>
    </span>
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
          <div className="mb-0.5 flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
            <span>
              {s.label} <span className="text-slate-400">· {s.hint}</span>
            </span>
            {s.key === "yesterdayTasks" && <ProgressSummary value={standup[s.key]} className="w-14" />}
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
