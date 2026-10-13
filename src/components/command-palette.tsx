"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { paletteSearch, runCommand, type PaletteItem } from "@/app/actions/palette";
import { Icon, type IconName } from "@/components/icons";
import { useLocale, useT } from "@/components/i18n";
import { todayKey } from "@/lib/dates";
import { parseCommand, type Command } from "@/lib/quick-command";

const OPEN = "pace:palette";
type Space = { id: string; name: string };
type Row = { key: string; icon: IconName | "run" | "go"; title: string; sub?: string; act: () => void };

const SEARCH = "m21 21-5.2-5.2m0 0A7.5 7.5 0 1 0 5.2 5.2a7.5 7.5 0 0 0 10.6 10.6Z";
const TYPE_ICON: Record<PaletteItem["type"], IconName> = { task: "open", note: "note", folder: "folder", file: "paperclip", person: "comment" };

/** ปุ่มเปิดแถบคำสั่ง — full = ช่องยาวใน sidebar (จอใหญ่) · ไม่ใส่ = ปุ่มไอคอน (แถบหัวมือถือ) */
export function PaletteButton({ full = false }: { full?: boolean }) {
  const tr = useT();
  const open = () => window.dispatchEvent(new Event(OPEN));
  const glyph = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-[1.15rem] shrink-0" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={SEARCH} />
    </svg>
  );
  if (!full) {
    return (
      <button type="button" onClick={open} aria-label={tr("ค้นหาและคำสั่ง")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-surface-sunken lg:hidden">
        {glyph}
      </button>
    );
  }
  return (
    <button type="button" onClick={open} className="mt-4 hidden min-h-10 w-full items-center gap-2 rounded-xl border border-border bg-surface-sunken/60 px-3 text-left text-sm text-muted-foreground transition hover:bg-surface-sunken hover:text-foreground lg:flex">
      {glyph}
      <span className="min-w-0 flex-1 truncate">{tr("ค้นหาหรือสั่งงาน")}</span>
      <kbd className="shrink-0 rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-2xs text-subtle">⌘K</kbd>
    </button>
  );
}

/**
 * แถบคำสั่ง (Cmd/Ctrl+K): ช่องเดียวสำหรับค้นงาน โน้ต ไฟล์ และคนในทุกพื้นที่ ไปหน้าต่าง ๆ และพิมพ์คำสั่งลัด
 * เช่น "สร้างงาน เขียนรายงาน ส่ง พรุ่งนี้" · "#12 80%" · "เลื่อน #12 ไปวันศุกร์" — คำสั่งแยกด้วยรูปแบบตายตัว (lib/quick-command) ไม่ใช้ AI
 * คำสั่งทำกับพื้นที่ที่กำลังใช้ และแสดงตัวอย่างให้เห็นก่อนกด Enter เสมอ
 */
export function CommandPalette({ spaces, saved, pages }: { spaces: Space[]; saved?: string; pages: { href: string; label: string }[] }) {
  const tr = useT();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [found, setFound] = useState<{ for: string; items: PaletteItem[] } | null>(null);
  const [active, setActive] = useState(0);
  const [space, setSpace] = useState<Space | undefined>(undefined);
  const [error, setError] = useState<{ for: string; message: string } | null>(null);
  const [running, start] = useTransition();
  const list = useRef<HTMLUListElement>(null);
  const query = text.trim();

  useEffect(() => {
    const show = () => {
      // พื้นที่ที่กำลังใช้ตอนเปิด: ?team= ในลิงก์ → ที่เลือกไว้ล่าสุด → รายการแรก (กติกาเดียวกับทุกหน้า)
      const param = new URLSearchParams(window.location.search).get("team");
      setSpace(spaces.find((s) => s.id === param) ?? spaces.find((s) => s.id === saved) ?? spaces[0]);
      setText("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener(OPEN, show);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN, show);
      window.removeEventListener("keydown", onKey);
    };
  }, [spaces, saved]);

  // ค้นหลังหยุดพิมพ์ครู่หนึ่ง — ผลที่กลับมาช้ากว่าที่พิมพ์ต่อไปแล้วจะถูกทิ้ง (ผูกผลกับคำที่ค้น)
  useEffect(() => {
    if (!open || !query || !space) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const items = await paletteSearch(query, space.id).catch(() => []);
      if (!stale) setFound({ for: query, items });
    }, 180);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, query, space]);

  const close = () => setOpen(false);
  const go = (href: string) => {
    close();
    // ไฟล์เปิดในแท็บใหม่ (ไม่ใช่หน้าในแอป)
    if (href.startsWith("/api/")) window.open(href, "_blank", "noopener");
    else router.push(href);
  };
  const run = () => {
    if (!space) return;
    start(async () => {
      const result = await runCommand(query, space.id).catch(() => ({ ok: false as const, error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }));
      if (!result.ok) return setError({ for: query, message: result.error });
      close();
      router.push(result.href);
      router.refresh();
    });
  };

  const command = useMemo(() => (query ? parseCommand(query, todayKey()) : null), [query]);
  const day = (key: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T00:00:00Z`));
  const describe = (c: Command): string => {
    if (c.kind === "task") return c.due ? tr("สร้างงาน \"{0}\" กำหนดส่ง {1}", [c.title, day(c.due)]) : tr("สร้างงาน \"{0}\"", [c.title]);
    if (c.kind === "note") return tr("สร้างโน้ต \"{0}\"", [c.title]);
    if (c.kind === "progress") return c.progress >= 100 ? tr("ปิดงาน #{0} เป็นเสร็จแล้ว", [c.number]) : tr("อัปเดตงาน #{0} เป็น {1}%", [c.number, c.progress]);
    if (c.kind === "due") return c.due ? tr("เลื่อนกำหนดส่งงาน #{0} เป็น {1}", [c.number, day(c.due)]) : tr("ล้างกำหนดส่งของงาน #{0}", [c.number]);
    return tr("เปิดงาน #{0}", [c.number]);
  };

  const items = found && found.for === query ? found.items : [];
  const searching = Boolean(query) && (!found || found.for !== query);
  const sections: { title: string; rows: Row[] }[] = [];
  if (command && space) sections.push({ title: tr("คำสั่ง"), rows: [{ key: "run", icon: "run", title: describe(command), sub: tr("ใน {0} · กด Enter เพื่อทำ", [space.name]), act: run }] });
  const lower = query.toLowerCase();
  const pageRows = pages.filter((p) => !query || p.label.toLowerCase().includes(lower)).map((p): Row => ({ key: p.href, icon: "go", title: p.label, act: () => go(p.href) }));
  const group = (title: string, types: PaletteItem["type"][]) => {
    const rows = items.filter((i) => types.includes(i.type)).map((i): Row => ({ key: `${i.type}:${i.id}`, icon: TYPE_ICON[i.type], title: i.title, sub: i.sub, act: () => go(i.href) }));
    if (rows.length > 0) sections.push({ title, rows });
  };
  group(tr("งาน"), ["task"]);
  group(tr("โน้ต"), ["note", "folder"]);
  group(tr("ไฟล์"), ["file"]);
  group(tr("คน"), ["person"]);
  if (pageRows.length > 0) sections.push({ title: tr("ไปที่"), rows: pageRows });
  const rows = sections.flatMap((s) => s.rows);
  const current = Math.min(active, Math.max(0, rows.length - 1));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    // ระหว่างเลือกคำในแป้นพิมพ์ภาษาไทย/ญี่ปุ่น Enter เป็นของแป้นพิมพ์
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const next = (current + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
      setActive(next);
      list.current?.querySelector(`[data-row="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!running) rows[current]?.act();
    }
  };

  if (!open) return null;
  const examples = [tr("สร้างงาน เขียนรายงาน ส่ง พรุ่งนี้"), "#12 80%", tr("เลื่อน #12 ไปวันศุกร์"), tr("โน้ตใหม่ สรุปประชุม")];
  let index = -1;
  return createPortal(
    <div className="fixed inset-0 z-[90]">
      <button type="button" aria-label={tr("ปิด")} onClick={close} className="absolute inset-0 cursor-default bg-foreground/25" />
      <div role="dialog" aria-modal="true" aria-label={tr("ค้นหาและคำสั่ง")} className="tooltip-pop absolute inset-x-3 top-[calc(0.75rem+env(safe-area-inset-top))] mx-auto flex max-h-[min(34rem,calc(100dvh-1.5rem))] max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-overlay sm:top-20">
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-5 shrink-0 text-subtle" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={SEARCH} />
          </svg>
          <input
            autoFocus
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            enterKeyHint="go"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows.length > 0 ? `palette-row-${current}` : undefined}
            aria-label={tr("ค้นหาหรือสั่งงาน")}
            placeholder={tr("ค้นหางาน โน้ต ไฟล์ คน หรือพิมพ์คำสั่ง")}
            className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle"
          />
          <button type="button" onClick={close} className="shrink-0 rounded-lg px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-surface-sunken hover:text-foreground">{tr("ปิด")}</button>
        </div>
        <ul ref={list} id="palette-list" role="listbox" aria-label={tr("ผลลัพธ์")} className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && error.for === query && <li role="alert" className="mx-1 mb-1 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{tr(error.message)}</li>}
          {sections.map((section) => (
            <li key={section.title} role="presentation">
              <p className="px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.1em] text-subtle">{section.title}</p>
              <ul role="group" aria-label={section.title}>
                {section.rows.map((row) => {
                  const i = ++index;
                  const on = i === current;
                  return (
                    <li key={row.key} id={`palette-row-${i}`} data-row={i} role="option" aria-selected={on} onPointerMove={() => on || setActive(i)} onClick={() => running || row.act()} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-1.5 ${on ? "bg-primary-soft" : ""} ${running && row.key === "run" ? "opacity-60" : ""}`}>
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${row.icon === "run" ? "bg-primary text-primary-foreground" : "bg-surface-sunken text-muted-foreground"}`}>
                        {row.icon === "run" || row.icon === "go" ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="size-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d={row.icon === "run" ? "m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" : "M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"} />
                          </svg>
                        ) : (
                          <Icon name={row.icon} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{row.title}</span>
                        {row.sub && <span className="block truncate text-xs text-muted-foreground">{row.sub}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {query && !searching && items.length === 0 && !command && pageRows.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{tr("ไม่พบสิ่งที่ตรงกับ \"{0}\"", [query])}</li>}
          {searching && items.length === 0 && <li className="px-3 py-2 text-xs text-subtle">{tr("กำลังค้นหา…")}</li>}
        </ul>
        {!query && (
          <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{tr("พิมพ์คำสั่งได้เลย เช่น")}</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => setText(example)} className="rounded-lg bg-surface-sunken px-2 py-1 text-left transition hover:text-foreground">{example}</button>
                </li>
              ))}
            </ul>
            {space && <p className="mt-2">{tr("คำสั่งทำกับพื้นที่ที่กำลังใช้: {0}", [space.name])}</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
