"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { deleteTask, restoreTask } from "@/app/actions/tasks";
import { SwipeToDelete } from "@/components/swipe-to-delete";

/** แถบเลิกทำแสดงอยู่กี่วินาที */
const UNDO_SECONDS = 6;

type Deleted = { id: string; title: string; key: number };
const DeleteContext = createContext<((task: { id: string; title: string }) => Promise<void>) | null>(null);

const asForm = (id: string) => {
  const data = new FormData();
  data.set("id", id);
  return data;
};

/** ลบงาน (ซ่อนไว้ฝั่ง server) แล้วแสดงแถบ "เลิกทำ" ด้านล่างจอ */
export function UndoDeleteProvider({ children }: { children: React.ReactNode }) {
  const [deleted, setDeleted] = useState<Deleted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, startRestore] = useTransition();
  const timer = useRef<number | undefined>(undefined);

  const hideLater = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setDeleted(null), UNDO_SECONDS * 1000);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const remove = useCallback(
    async (task: { id: string; title: string }) => {
      setError(null);
      const result = await deleteTask(asForm(task.id));
      if (!result.ok) {
        setError("ลบงานไม่สำเร็จ");
        return;
      }
      setDeleted({ ...task, key: Date.now() });
      hideLater();
    },
    [hideLater],
  );

  const undo = () => {
    if (!deleted) return;
    const task = deleted;
    window.clearTimeout(timer.current);
    startRestore(async () => {
      const result = await restoreTask(asForm(task.id));
      setDeleted(null);
      if (!result.ok) setError("กู้คืนงานไม่สำเร็จ");
    });
  };

  return (
    <DeleteContext.Provider value={remove}>
      {children}
      {(deleted || error) && (
        <div
          role="status"
          aria-live="polite"
          // มือถือ: ลอยเหนือแถบเมนูล่าง
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg lg:bottom-6"
        >
          {deleted ? (
            <>
              <span className="min-w-0 flex-1 truncate">ลบงาน &quot;{deleted.title}&quot; แล้ว</span>
              <button
                type="button"
                onClick={undo}
                disabled={restoring}
                className="shrink-0 rounded-lg px-2 py-1 font-semibold text-indigo-300 transition hover:bg-white/10 hover:text-indigo-200"
              >
                {restoring ? "กำลังกู้คืน…" : "เลิกทำ"}
              </button>
              {/* แถบนับถอยหลัง */}
              <span
                key={deleted.key}
                aria-hidden="true"
                className="absolute inset-x-4 bottom-1 h-0.5 origin-left rounded-full bg-white/30"
                style={{ animation: `undo-countdown ${UNDO_SECONDS}s linear forwards` }}
              />
            </>
          ) : (
            <>
              <span className="flex-1 text-rose-200">{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 px-2 text-white/70">ปิด</button>
            </>
          )}
        </div>
      )}
    </DeleteContext.Provider>
  );
}

function useDeleteTask() {
  const remove = useContext(DeleteContext);
  if (!remove) throw new Error("useDeleteTask must be used inside UndoDeleteProvider");
  return remove;
}

/** ปุ่ม × (เมาส์/คีย์บอร์ด) */
export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
  const remove = useDeleteTask();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-label={`ลบงาน ${title}`}
      title="ลบงาน"
      disabled={pending}
      onClick={() => start(() => remove({ id, title }))}
      className="rounded-lg px-2 py-1 text-slate-400 transition hover:text-rose-600 disabled:opacity-40"
    >
      ×
    </button>
  );
}

/** ปัดขวาเพื่อลบ (มือถือ) */
export function SwipeDeleteTask({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const remove = useDeleteTask();
  return (
    <SwipeToDelete label="ลบงาน" onDelete={() => remove({ id, title })}>
      {children}
    </SwipeToDelete>
  );
}
