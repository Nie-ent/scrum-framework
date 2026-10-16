"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import * as P from "@radix-ui/react-popover";
import { deleteTask, restoreTask } from "@/app/actions/tasks";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { useT } from "@/components/i18n";

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
  const tr = useT();
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
        setError(tr("ลบงานไม่สำเร็จ"));
        return;
      }
      setDeleted({ ...task, key: Date.now() });
      hideLater();
    },
    [hideLater, tr],
  );

  const undo = () => {
    if (!deleted) return;
    const task = deleted;
    window.clearTimeout(timer.current);
    startRestore(async () => {
      const result = await restoreTask(asForm(task.id));
      setDeleted(null);
      if (!result.ok) setError(tr("กู้คืนงานไม่สำเร็จ"));
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
          className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-tooltip px-4 py-3 text-sm text-tooltip-foreground shadow-lg lg:bottom-6"
        >
          {deleted ? (
            <>
              <span className="min-w-0 flex-1 truncate">{tr("ลบงาน \"")}{deleted.title}{tr("\" แล้ว")}</span>
              <button
                type="button"
                onClick={undo}
                disabled={restoring}
                className="shrink-0 rounded-lg px-2 py-1 font-semibold text-tooltip-foreground underline underline-offset-4 transition hover:bg-tooltip-foreground/10"
              >
                {restoring ? tr("กำลังกู้คืน…") : tr("เลิกทำ")}
              </button>
              {/* แถบนับถอยหลัง */}
              <span
                key={deleted.key}
                aria-hidden="true"
                className="absolute inset-x-4 bottom-1 h-0.5 origin-left rounded-full bg-tooltip-foreground/30"
                style={{ animation: `undo-countdown ${UNDO_SECONDS}s linear forwards` }}
              />
            </>
          ) : (
            <>
              <span className="flex-1 text-tooltip-foreground">{error}</span>
              <button type="button" onClick={() => setError(null)} className="shrink-0 px-2 text-tooltip-foreground/70">{tr("ปิด")}</button>
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

/** ปุ่มลบ (เมาส์/คีย์บอร์ด) — กดแล้วถามยืนยันก่อน กันกดพลาด (ลบแล้วยังกดเลิกทำได้อีกครั้ง) */
export function DeleteTaskButton({ id, title }: { id: string; title: string }) {
  const tr = useT();
  const remove = useDeleteTask();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        aria-label={tr("ลบงาน {0}", [title])}
        className="flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition hover:bg-danger-soft hover:text-danger data-[state=open]:bg-danger-soft data-[state=open]:text-danger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
        </svg>
        <span className="max-sm:sr-only">{tr("ลบ")}</span>
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" sideOffset={8} collisionPadding={16} className="tooltip-pop z-[80] w-72 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-overlay">
          <div>
            <p className="text-sm font-semibold text-foreground">{tr("ลบงานนี้?")}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{title}</p>
          </div>
          <div className="flex justify-end gap-2">
            <P.Close className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("ยกเลิก")}</P.Close>
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => { await remove({ id, title }); setOpen(false); })}
              className="btn min-h-9 bg-danger px-3 py-1 text-sm text-primary-foreground hover:bg-danger/90"
            >
              {pending ? tr("กำลังลบ…") : tr("ลบงาน")}
            </button>
          </div>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/** ปัดขวาเพื่อลบ (มือถือ) */
export function SwipeDeleteTask({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const tr = useT();
  const remove = useDeleteTask();
  return (
    <SwipeToDelete label={tr("ลบงาน")} onDelete={() => remove({ id, title })}>
      {children}
    </SwipeToDelete>
  );
}
