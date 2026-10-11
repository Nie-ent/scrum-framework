"use client";

import { useActionState, useState } from "react";
import { saveStandup } from "@/app/actions/standup";
import { FormMessage, SubmitButton } from "@/components/form";
import { HelpTip } from "@/components/tooltip";
import { TEXT_SECTIONS, type TextSectionKey } from "@/lib/standup-sections";
import { TaskListEditor, serializeTasks } from "@/components/task-list-editor";
import { isDone, type Task } from "@/lib/tasks";
import { useT } from "@/components/i18n";

const PLACEHOLDERS: Record<TextSectionKey, string> = {
  blockers: "มีอะไรที่ต้องให้คนอื่นช่วยไหม (ไม่มีเว้นว่างได้)",
  notWorking: "วิธีทำงาน เครื่องมือ หรือการสื่อสารที่ยังไม่ดี",
  workingWell: "สิ่งที่ทำแล้วดี อยากให้ทำต่อ",
};

export function StandupForm({
  teamId,
  teamName,
  initial,
  carriedOver,
  submitted,
  assigned,
}: {
  teamId: string;
  teamName: string;
  initial: { yesterdayTasks: Task[]; todayTasks: Task[] } & Record<TextSectionKey, string>;
  /** "ล่าสุดทำอะไรไป" ถูกเติมจากแผนครั้งก่อน */
  carriedOver: boolean;
  submitted: boolean;
  /** งานที่ได้รับมอบหมายในทีมนี้และยังไม่เสร็จ */
  assigned: AssignedTask[];
}) {
  const tr = useT();
  const [state, action] = useActionState(saveStandup, undefined);
  const [yesterday, setYesterday] = useState<Task[]>(initial.yesterdayTasks);

  // งานที่ยังไม่ถึง 100% ถูกยกไป "วันนี้จะทำอะไร" อัตโนมัติ — ผู้ใช้พิมพ์เองเฉพาะงานใหม่ (extra)
  const initialUnfinished = new Set(initial.yesterdayTasks.filter((t) => !isDone(t)).map((t) => t.text.trim()));
  const [extra, setExtra] = useState<Task[]>(() => initial.todayTasks.filter((t) => !initialUnfinished.has(t.text.trim())));
  // งานค้างที่ผู้ใช้เลือกไม่ทำต่อวันนี้ (ถ้าเคยส่งแล้ว: งานค้างที่ไม่อยู่ในแผนที่บันทึกไว้ = เคยนำออก)
  const [dropped, setDropped] = useState<Set<string>>(() => {
    if (!submitted) return new Set();
    const saved = new Set(initial.todayTasks.map((t) => t.text.trim()));
    return new Set([...initialUnfinished].filter((text) => !saved.has(text)));
  });

  const unfinished = yesterday
    .filter((t) => t.text.trim() && !isDone(t))
    // เก็บ % ล่าสุดไว้ ครั้งถัดไปงานนี้จะเริ่มจาก % เดิม ไม่ต้องกรอกใหม่จาก 0
    .map((t): Task => ({ text: t.text.trim(), progress: t.progress ?? 0, ...(t.taskId ? { taskId: t.taskId } : {}), ...(t.editable ? { editable: true } : {}) }));
  const carried = unfinished.filter((t) => !dropped.has(t.text) && !extra.some((e) => e.text.trim() === t.text));
  const droppedCount = unfinished.filter((t) => dropped.has(t.text)).length;
  const today = [...carried, ...extra];

  // งานที่มอบหมายซึ่งยังไม่อยู่ในเช็กอินนี้ — แตะเพื่อเพิ่ม
  // เทียบทั้ง id และชื่อ: บรรทัดที่เพิ่งพิมพ์ยังไม่มี id จนกว่าจะโหลดหน้าใหม่
  const used = new Set([...yesterday, ...today].flatMap((t) => (t.taskId ? [t.taskId] : [])));
  const usedText = new Set([...yesterday, ...today].map((t) => t.text.trim()));
  const available = assigned.filter((t) => !used.has(t.id) && !usedText.has(t.title));
  const filled = (list: Task[]) => list.filter((t) => t.text.trim());
  const fromAssigned = (t: AssignedTask): Task => ({ text: t.title, taskId: t.id, progress: t.progress, ...(t.editable ? { editable: true } : {}) });

  const setDrop = (text: string, drop: boolean) =>
    setDropped((prev) => {
      const next = new Set(prev);
      if (drop) next.add(text);
      else next.delete(text);
      return next;
    });

  return (
    <form action={action} className="card space-y-6">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="yesterdayTasks" value={serializeTasks(yesterday)} />
      <input type="hidden" name="todayTasks" value={serializeTasks(today)} />

      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="eyebrow">{tr("เช็กอินวันนี้ ·")}{" "}{teamName}</p>
          <p className="text-sm text-slate-500">{tr("ใช้เวลาเพียง 2 นาที — แชร์เฉพาะสิ่งที่ทีมต้องรู้")}</p>
        </div>
        <span className={`badge shrink-0 ${submitted ? "badge-success" : "badge-warning"}`}>{submitted ? tr("บันทึกแล้ว") : tr("รอเช็กอิน")}</span>
      </div>

      <div className="space-y-5">
        <div>
          <label className="label" id="yesterdayTasks-label" htmlFor="yesterdayTasks">
            {tr("ล่าสุดทำอะไรไป")}
            <span className="text-rose-500"> *</span>
          </label>
          {carriedOver && (
            <p className="mb-2 text-xs text-slate-500">{tr("ยกมาจากแผนครั้งก่อนของทีมนี้ — อัปเดต % ความคืบหน้า (ติ๊ก ✓ = เสร็จ 100%) แล้วเพิ่มงานอื่นที่ทำได้")}</p>
          )}
          <TaskListEditor id="yesterdayTasks" items={yesterday} onChange={setYesterday} withProgress placeholder={tr("เช่น เตรียมเอกสารนำเสนอ")} />
          <AssignedChips tasks={available} label={tr("งานค้างของฉันที่ยังไม่อยู่ในเช็กอินนี้ — แตะเพื่อรายงานความคืบหน้า")} onPick={(t) => setYesterday([...filled(yesterday), fromAssigned(t)])} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center gap-1">
            <label className="label mb-0" id="todayTasks-label" htmlFor="todayTasks">
              {tr("วันนี้จะทำอะไร")}
              <span className="text-rose-500"> *</span>
            </label>
            <HelpTip title={tr("งานยกมาอัตโนมัติ")}>{tr("งานที่ยังไม่ถึง 100% จะถูกยกมาไว้ในแผนวันนี้ให้เอง พร้อม % ล่าสุด และจะขึ้นเป็น “ล่าสุดทำอะไรไป” ในครั้งถัดไป งานที่พิมพ์ใหม่จะไปอยู่ในหน้า งาน ด้วย")}</HelpTip>
          </div>
          {carried.length > 0 && (
            <ul className="mb-2 space-y-1.5" aria-label={tr("งานที่ยกมาจากครั้งก่อน")}>
              {carried.map((t) => (
                <li key={t.text} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-slate-700">{t.text}</span>
                  <span className="badge badge-warning shrink-0">{tr("ทำต่อ ·")}{" "}{t.progress}%</span>
                  <button
                    type="button"
                    aria-label={tr("ไม่ทำ \"{0}\" ต่อวันนี้", [t.text])}
                    title={tr("ไม่ทำต่อวันนี้")}
                    onClick={() => setDrop(t.text, true)}
                    className="shrink-0 rounded-lg px-2 py-1 text-slate-400 transition hover:text-rose-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(carried.length > 0 || droppedCount > 0) && (
            <p className="mb-2 pl-4 text-xs text-slate-500">
              {tr("งานที่ยังไม่ถึง 100% ถูกยกมาให้อัตโนมัติ")}
              {droppedCount > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    className="font-medium text-indigo-600 hover:underline"
                    onClick={() => unfinished.forEach((t) => setDrop(t.text, false))}
                  >
                    {tr("นำงานที่เอาออกกลับมา (")}{droppedCount})
                  </button>
                </>
              )}
            </p>
          )}
          <TaskListEditor id="todayTasks" items={extra} onChange={setExtra} placeholder={carried.length > 0 ? tr("เพิ่มงานอื่นของวันนี้") : tr("เช่น โทรนัดลูกค้า")} />
          <AssignedChips tasks={available} label={tr("งานค้างของฉัน — แตะเพื่อใส่ในแผนวันนี้")} onPick={(t) => setExtra([...filled(extra), fromAssigned(t)])} />
          <p className="mt-1 pl-4 text-xs text-slate-400">{tr("งานที่พิมพ์ใหม่จะถูกเพิ่มเป็นงานของคุณในหน้า งาน และขึ้นเป็น \"ล่าสุดทำอะไรไป\" ในเช็กอินครั้งถัดไป")}</p>
        </div>
      </div>

      {/* เปิดไว้ถ้ามีข้อมูลอยู่แล้ว — ไม่ให้ blocker ที่กรอกไว้ถูกซ่อน */}
      <details
        className="group rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
        open={Boolean(initial.blockers || initial.notWorking || initial.workingWell)}
      >
        <summary className="cursor-pointer list-none pr-7 text-sm font-semibold text-slate-700 marker:hidden">
          <span className="relative block after:absolute after:right-0 after:top-0 after:content-['+'] group-open:after:content-['−']">{tr("มีอะไรให้ทีมช่วยหรืออยากสะท้อนเพิ่มไหม?")}</span>
          <span className="mt-1 block text-xs font-normal text-slate-500">{tr("เรื่องที่ติดขัดและข้อเสนอแนะ — ไม่บังคับ")}</span>
        </summary>
        <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
          {TEXT_SECTIONS.map((section) => (
            <div key={section.key}>
              <label className="label" htmlFor={section.key}>
                {tr(section.label)}
              </label>
              <textarea id={section.key} name={section.key} rows={2} className="input resize-y" placeholder={tr(PLACEHOLDERS[section.key])} defaultValue={initial[section.key]} />
            </div>
          ))}
        </div>
      </details>

      <FormMessage state={state} />
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400">{tr("* จำเป็นต้องกรอก")}</p>
        <SubmitButton>{submitted ? tr("บันทึกการอัปเดต") : tr("ส่งเช็กอิน")}</SubmitButton>
      </div>
    </form>
  );
}

type AssignedTask = { id: string; title: string; progress: number; editable?: boolean };

/** แสดงงานค้างเป็นปุ่มให้แตะเพิ่ม — เกิน CHIP_LIMIT ซ่อนส่วนที่เหลือไว้หลังปุ่ม "ดูทั้งหมด" */
const CHIP_LIMIT = 6;

function AssignedChips({ tasks, label, onPick }: { tasks: AssignedTask[]; label: string; onPick: (task: AssignedTask) => void }) {
  const tr = useT();
  const [showAll, setShowAll] = useState(false);
  if (tasks.length === 0) return null;
  const shown = showAll ? tasks : tasks.slice(0, CHIP_LIMIT);
  return (
    <div className="mt-2 pl-4">
      <p className="mb-1.5 text-xs font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50/60 px-3 py-1.5 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            <span aria-hidden="true">＋</span>
            <span className="truncate">{t.title}</span>
            {t.progress > 0 && <span className="shrink-0 text-indigo-400">{t.progress}%</span>}
          </button>
        ))}
        {tasks.length > CHIP_LIMIT && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:text-indigo-700">
            {showAll ? tr("ย่อ") : tr("ดูทั้งหมด ({0})", [tasks.length])}
          </button>
        )}
      </div>
    </div>
  );
}
