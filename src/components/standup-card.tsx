import type { Standup } from "@prisma/client";

export const SECTIONS = [
  { key: "yesterday", label: "ล่าสุดทำอะไรไป", hint: "Yesterday", tone: "slate" },
  { key: "today", label: "วันนี้จะทำอะไร", hint: "Today", tone: "indigo" },
  { key: "blockers", label: "ติดปัญหาอะไร", hint: "Blockers", tone: "red" },
  { key: "notWorking", label: "อะไรที่ไม่เวิร์ก", hint: "Not work", tone: "amber" },
  { key: "workingWell", label: "อะไรที่เวิร์ก", hint: "Work well", tone: "emerald" },
] as const;

export type SectionKey = (typeof SECTIONS)[number]["key"];

const TONES = {
  slate: "border-slate-300",
  indigo: "border-blue-400",
  red: "border-red-400 bg-red-50/60",
  amber: "border-amber-400 bg-amber-50/60",
  emerald: "border-emerald-400 bg-emerald-50/60",
} as const;

export function StandupSections({
  standup,
  only,
}: {
  standup: Pick<Standup, SectionKey>;
  only?: readonly SectionKey[];
}) {
  const sections = SECTIONS.filter((s) => (!only || only.includes(s.key)) && standup[s.key]);
  return (
    <div className="space-y-2">
      {sections.map((s) => (
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
