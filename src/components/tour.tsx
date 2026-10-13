"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/components/i18n";
import { TOURS, tourForPath, type Tour } from "@/lib/tours";

const START = "pace:tour";
const HELP = "pace:help";
const PENDING = "pace-tour-pending";
const SEEN = "pace-tour-seen";
type Box = { top: number; left: number; width: number; height: number };

/** เปิดหน้าต่าง "ช่วยเหลือ" (เรียกได้จากทุกที่ เช่น เมนูบัญชี หรือแถบคำสั่ง) */
export const openHelp = () => window.dispatchEvent(new Event(HELP));

const store = (action: (s: Storage) => void, kind: "local" | "session" = "local") => {
  try {
    action(kind === "local" ? localStorage : sessionStorage);
  } catch {
    // เก็บไม่ได้ (โหมดส่วนตัว) ก็ยังใช้ทัวร์ได้ แค่จำไม่ได้
  }
};

/** สิ่งแรกที่ตรง selector และมองเห็นอยู่จริง (เมนูจอใหญ่/มือถือใช้ชื่อเดียวกัน จึงต้องเลือกอันที่แสดงอยู่) */
function findTarget(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) return el;
  }
  return null;
}

/**
 * ทัวร์แนะนำแบบทีละขั้น: เน้นส่วนของหน้าที่กำลังพูดถึงและหรี่ส่วนที่เหลือ พร้อมการ์ดอธิบายข้าง ๆ
 * หน้าเว็บยังกดได้ตามปกติระหว่างทัวร์ (ทำตามไปด้วยได้) · ข้ามได้ทุกขั้น (ปุ่มข้าม หรือ Esc)
 * "ช่วยเหลือ" เดาจากหน้าที่เปิดอยู่ว่าน่าจะอยากให้ช่วยเรื่องอะไร และให้เลือกเรื่องอื่นได้ — ทัวร์ของหน้าอื่นจะพาไปหน้านั้นก่อนแล้วเริ่ม
 * fresh = บัญชีเพิ่งสร้าง: เริ่มทัวร์แนะนำให้เองหนึ่งครั้ง (จำไว้ในเครื่องนี้)
 */
export function TourHost({ fresh }: { fresh: boolean }) {
  const tr = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  const [run, setRun] = useState<{ tour: Tour; index: number; back: boolean } | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const card = useRef<HTMLDivElement>(null);

  const begin = useCallback(
    (id: string) => {
      const tour = TOURS.find((t) => t.id === id);
      if (!tour) return;
      setHelp(false);
      store((s) => s.setItem(SEEN, "1"));
      // ทัวร์ของหน้าอื่น: ไปหน้านั้นก่อน แล้วเริ่มเมื่อหน้าเปลี่ยน
      if (tour.path && !(window.location.pathname === tour.path || window.location.pathname.startsWith(`${tour.path}/`))) {
        store((s) => s.setItem(PENDING, id), "session");
        router.push(tour.path);
        return;
      }
      setBox(null);
      setRun({ tour, index: 0, back: false });
    },
    [router],
  );
  const end = useCallback(() => {
    setRun(null);
    setBox(null);
  }, []);

  useEffect(() => {
    const onStart = (e: Event) => begin((e as CustomEvent<string>).detail);
    const onHelp = () => {
      end();
      setHelp(true);
    };
    window.addEventListener(START, onStart);
    window.addEventListener(HELP, onHelp);
    return () => {
      window.removeEventListener(START, onStart);
      window.removeEventListener(HELP, onHelp);
    };
  }, [begin, end]);

  // หน้าเปลี่ยน: เริ่มทัวร์ที่รออยู่ · บัญชีใหม่ที่ยังไม่เคยเห็นทัวร์: เริ่มทัวร์แนะนำให้เอง
  useEffect(() => {
    const timer = setTimeout(() => {
      let pending: string | null = null;
      let seen = true;
      store((s) => {
        pending = s.getItem(PENDING);
        s.removeItem(PENDING);
      }, "session");
      store((s) => (seen = s.getItem(SEEN) === "1"));
      if (pending) begin(pending);
      else if (fresh && !seen) begin("start");
    }, 400);
    return () => clearTimeout(timer);
  }, [pathname, fresh, begin]);

  // ออกจากหน้าของทัวร์กลางคัน = จบทัวร์
  const tourPath = run?.tour.path;
  useEffect(() => {
    if (!tourPath || pathname === tourPath || pathname.startsWith(`${tourPath}/`)) return;
    const timer = setTimeout(end, 0);
    return () => clearTimeout(timer);
  }, [pathname, tourPath, end]);

  // หาเป้าหมายของขั้นนี้ (รอให้หน้าโหลดสักครู่) — ไม่เจอ = ข้ามไปขั้นถัดไปในทิศที่กำลังไป · ตามตำแหน่งเมื่อเลื่อน/ปรับขนาดจอ
  const step = run ? run.tour.steps[run.index] : null;
  useEffect(() => {
    if (!run || !step) return;
    let target: HTMLElement | null = null;
    let tries = 0;
    let frame = 0;
    const measure = () => {
      if (!target || !target.isConnected) return;
      const r = target.getBoundingClientRect();
      setBox((old) => (old && old.top === r.top && old.left === r.left && old.width === r.width && old.height === r.height ? old : { top: r.top, left: r.left, width: r.width, height: r.height }));
    };
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const seek = setInterval(() => {
      target = findTarget(step.target);
      if (target) {
        clearInterval(seek);
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        measure();
        return;
      }
      if (++tries < 12) return;
      clearInterval(seek);
      const next = run.index + (run.back ? -1 : 1);
      if (next < 0 || next >= run.tour.steps.length) end();
      else setRun({ ...run, index: next });
    }, 120);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    // เนื้อหาที่โหลดตามมาอาจดันตำแหน่ง — วัดซ้ำเป็นระยะระหว่างที่ขั้นนี้เปิดอยู่
    const watch = setInterval(measure, 400);
    return () => {
      clearInterval(seek);
      clearInterval(watch);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [run, step, end]);

  useEffect(() => {
    if (!run && !help) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      end();
      setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, help, end]);

  // วางการ์ดใต้เป้าหมาย (ไม่พอที่ = ด้านบน) และไม่ให้ล้นขอบจอ
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!box || !card.current) return;
    const size = card.current.getBoundingClientRect();
    const gap = 14;
    const below = box.top + box.height + gap;
    const above = box.top - gap - size.height;
    const top = below + size.height <= window.innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, window.innerHeight - size.height - 8);
    const left = Math.min(Math.max(12, box.left + box.width / 2 - size.width / 2), window.innerWidth - size.width - 12);
    setPlace((old) => (old && old.top === top && old.left === left ? old : { top, left }));
  }, [box, run]);
  useEffect(() => {
    if (place) card.current?.querySelector<HTMLButtonElement>("[data-next]")?.focus({ preventScroll: true });
  }, [run?.index, Boolean(place)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!run && !help) return null;
  const suggested = tourForPath(pathname);
  const others = TOURS.filter((t) => t !== suggested);
  const topic = (tour: Tour, primary = false) => (
    <li key={tour.id}>
      <button type="button" onClick={() => begin(tour.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${primary ? "bg-primary-soft hover:brightness-95" : "hover:bg-surface-sunken"}`}>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{tr(tour.title)}</span>
          <span className="block text-xs text-muted-foreground">{tr(tour.summary)} · {tr("{0} ขั้น", [tour.steps.length])}</span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-primary">→</span>
      </button>
    </li>
  );

  return createPortal(
    run && step ? (
      <div className="fixed inset-0 z-[95] pointer-events-none">
        {box ? (
          <div
            aria-hidden="true"
            className="absolute rounded-xl ring-2 ring-primary transition-all duration-200 ease-out"
            style={{ top: box.top - 6, left: box.left - 6, width: box.width + 12, height: box.height + 12, boxShadow: "0 0 0 200vmax oklch(0.15 0.02 270 / 0.55)" }}
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0 bg-foreground/20" />
        )}
        {box && (
          <div
            ref={card}
            role="dialog"
            aria-label={tr(run.tour.title)}
            aria-live="polite"
            className="pointer-events-auto absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-border bg-surface p-4 shadow-overlay transition-[top,left] duration-200 ease-out"
            style={{ top: place?.top ?? -9999, left: place?.left ?? 12 }}
          >
            <p className="text-2xs font-semibold uppercase tracking-[0.1em] text-primary">{tr(run.tour.title)} · {run.index + 1}/{run.tour.steps.length}</p>
            <h2 className="mt-1 font-semibold text-foreground">{tr(step.title)}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{tr(step.body)}</p>
            <div className="mt-3 flex items-center gap-2">
              <button type="button" onClick={end} className="mr-auto rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground">{tr("ข้าม")}</button>
              {run.index > 0 && <button type="button" onClick={() => setRun({ ...run, index: run.index - 1, back: true })} className="btn-ghost min-h-9 px-3 py-1.5">{tr("ย้อนกลับ")}</button>}
              <button type="button" data-next onClick={() => (run.index + 1 >= run.tour.steps.length ? end() : setRun({ ...run, index: run.index + 1, back: false }))} className="btn min-h-9 px-4 py-1.5">
                {run.index + 1 >= run.tour.steps.length ? tr("เสร็จแล้ว") : tr("ถัดไป")}
              </button>
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="fixed inset-0 z-[90]">
        <button type="button" aria-label={tr("ปิด")} onClick={() => setHelp(false)} className="absolute inset-0 cursor-default bg-foreground/25" />
        <div role="dialog" aria-modal="true" aria-label={tr("ช่วยเหลือ")} className="tooltip-pop absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto flex max-h-[min(36rem,calc(100dvh-1.5rem))] max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay sm:top-20">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div>
              <h2 className="font-semibold text-foreground">{tr("ช่วยเหลือ")}</h2>
              <p className="text-xs text-muted-foreground">{tr("เลือกเรื่องที่อยากให้พาทำทีละขั้น ข้ามได้ทุกเมื่อ")}</p>
            </div>
            <button type="button" onClick={() => setHelp(false)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground">{tr("ปิด")}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {suggested && (
              <>
                <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{tr("แนะนำสำหรับหน้านี้")}</p>
                <ul>{topic(suggested, true)}</ul>
              </>
            )}
            <p className="px-3 pb-1 pt-3 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{suggested ? tr("เรื่องอื่น") : tr("อยากให้ช่วยเรื่องอะไร")}</p>
            <ul>{others.map((t) => topic(t))}</ul>
          </div>
          <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{tr("หาอะไรไม่เจอ? กด Cmd/Ctrl+K เพื่อค้นหาหรือสั่งงานได้จากทุกหน้า")}</p>
        </div>
      </div>
    ),
    document.body,
  );
}
