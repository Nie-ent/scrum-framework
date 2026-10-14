"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AssignKind } from "@prisma/client";
import { addNoteComment, assignThread, completeAssignment, editComment, noteThreads, removeComment, resolveThread } from "@/app/actions/comments";
import type { NoteThread } from "@/lib/comment-ops";
import { locateAnchor, makeAnchor, type Anchor } from "@/lib/anchor";
import { Avatar } from "@/components/avatar";
import { Icon } from "@/components/icons";
import { RefText, type RefContext } from "@/components/ref-text";
import { RefTextarea } from "@/components/ref-textarea";
import { Select } from "@/components/select";
import { useLocale, useT } from "@/components/i18n";

/**
 * ความคิดเห็นในโน้ตแบบ Google Docs
 * - เลือกข้อความ → ปุ่ม "แสดงความคิดเห็น" ลอยขึ้น · คอมเมนต์ทั้งโน้ตก็ได้
 * - ข้อความที่มีความคิดเห็นถูกไฮไลต์ (CSS Custom Highlight API ไม่แตะเนื้อหา) · ชี้เพื่อดูตัวอย่าง คลิกเพื่อเปิดเธรด
 * - แผงข้างโน้ตตลอด (จอกว้างมาก) / แผงเลื่อนออกด้านขวา (คอมพิวเตอร์) / แผ่นเลื่อนขึ้น (มือถือ): ตอบ แท็ก @ มอบหมาย อ่าน/ตรวจ/แก้ ปิดเธรด
 * - ดึงความคิดเห็นของคนอื่นใหม่ทุก 30 วินาที และเมื่อกลับมาที่แท็บ
 */
const POLL_MS = 30_000;
const KIND_LABEL: Record<AssignKind, string> = { READ: "ขอให้อ่าน", REVIEW: "ขอให้ตรวจ", EDIT: "ขอให้แก้" };

type Index = { text: string; nodes: { node: Text; start: number }[] };

/** ข้อความทั้งหมดที่ผู้อ่านเห็นในเนื้อโน้ต พร้อมตำแหน่งของแต่ละ text node */
function buildIndex(root: HTMLElement): Index {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Index["nodes"] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: text.length });
    text += (n as Text).data;
  }
  return { text, nodes };
}

function rangeOf(index: Index, start: number, end: number): Range | null {
  const at = (pos: number, isEnd: boolean) => {
    for (let i = index.nodes.length - 1; i >= 0; i--) {
      const n = index.nodes[i];
      if (n.start < pos || (n.start === pos && !isEnd)) return { node: n.node, offset: Math.min(pos - n.start, n.node.data.length) };
    }
    return null;
  };
  const a = at(start, false);
  const b = at(end, true);
  if (!a || !b) return null;
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

function offsetOf(index: Index, node: Node, offset: number): number | null {
  const found = index.nodes.find((n) => n.node === node);
  return found ? found.start + offset : null;
}

/** ตำแหน่งตัวอักษรใต้เมาส์/นิ้ว */
function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = doc.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

const highlights = () => (typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: Map<string, unknown> }).highlights : null);
const Highlight = () => (typeof window !== "undefined" ? (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight : undefined);

export function NoteComments({
  noteId,
  initial,
  viewerId,
  canModerate,
  ctx,
  focusId,
  header,
  children,
}: {
  noteId: string;
  initial: NoteThread[];
  viewerId: string;
  canModerate: boolean;
  ctx: RefContext;
  /** เปิดเธรดนี้ตั้งแต่โหลด (ลิงก์จากแจ้งเตือน ?c=) */
  focusId?: string;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const tr = useT();
  const locale = useLocale();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState(initial);
  const [active, setActive] = useState<string | null>(focusId ?? null);
  const [panelOpen, setPanelOpen] = useState(Boolean(focusId));
  const [showResolved, setShowResolved] = useState(() => Boolean(focusId && initial.find((t) => t.id === focusId)?.resolvedAt));
  const [draft, setDraft] = useState<{ anchor: Anchor | null } | null>(null);
  const [bubble, setBubble] = useState<{ x: number; y: number; anchor: Anchor } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; id: string } | null>(null);
  const [index, setIndex] = useState<Index | null>(null);

  const refresh = useCallback(async () => {
    const next = await noteThreads(noteId);
    if (next) setThreads(next);
  }, [noteId]);

  // ดึงใหม่เป็นระยะ และเมื่อกลับมาที่แท็บ
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === "visible" && void refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // ข้อความในเนื้อโน้ตไม่เปลี่ยนระหว่างเปิดหน้า — สร้างดัชนีครั้งเดียวหลังวาด
  useEffect(() => {
    const timer = setTimeout(() => bodyRef.current && setIndex(buildIndex(bodyRef.current)), 0);
    return () => clearTimeout(timer);
  }, []);

  // ตำแหน่งของแต่ละเธรดในข้อความ (null = ข้อความเดิมถูกแก้/ลบไปแล้ว)
  const located = useMemo(() => {
    const map = new Map<string, { start: number; end: number } | null>();
    if (!index) return map;
    for (const t of threads) if (t.anchor) map.set(t.id, locateAnchor(index.text, t.anchor));
    return map;
  }, [threads, index]);

  // ไฮไลต์ข้อความของเธรดที่ยังเปิดอยู่
  useEffect(() => {
    const registry = highlights();
    const H = Highlight();
    if (!registry || !H || !index) return;
    const open: Range[] = [];
    const focus: Range[] = [];
    for (const t of threads) {
      const at = located.get(t.id);
      if (!at || (t.resolvedAt && t.id !== active)) continue;
      const range = rangeOf(index, at.start, at.end);
      if (range) (t.id === active ? focus : open).push(range);
    }
    registry.set("pace-comment", new H(...open));
    registry.set("pace-comment-active", new H(...focus));
    return () => {
      registry.delete("pace-comment");
      registry.delete("pace-comment-active");
    };
  }, [threads, located, index, active]);

  // เปิดจากลิงก์แจ้งเตือน: เลื่อนไปที่เธรด
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => document.getElementById(`thread-${active}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    return () => clearTimeout(timer);
  }, [active, panelOpen]);

  // เลือกข้อความในเนื้อโน้ต → ปุ่มแสดงความคิดเห็นลอยขึ้น
  useEffect(() => {
    const onSelect = () => {
      const sel = document.getSelection();
      const body = bodyRef.current;
      if (!sel || sel.isCollapsed || !body || !index || !body.contains(sel.anchorNode) || !body.contains(sel.focusNode)) return setBubble(null);
      const range = sel.getRangeAt(0);
      const start = offsetOf(index, range.startContainer, range.startOffset);
      const end = offsetOf(index, range.endContainer, range.endOffset);
      const anchor = start !== null && end !== null && end > start ? makeAnchor(index.text, start, end) : null;
      if (!anchor) return setBubble(null);
      const rect = range.getBoundingClientRect();
      setBubble({ x: Math.min(rect.right, window.innerWidth - 120), y: rect.bottom + 8, anchor });
    };
    document.addEventListener("selectionchange", onSelect);
    return () => document.removeEventListener("selectionchange", onSelect);
  }, [index]);

  const threadAt = (x: number, y: number) => {
    if (!index) return null;
    const caret = caretAt(x, y);
    const pos = caret ? offsetOf(index, caret.node, caret.offset) : null;
    if (pos === null) return null;
    return threads.find((t) => {
      const at = located.get(t.id);
      return at && (!t.resolvedAt || t.id === active) && pos >= at.start && pos < at.end;
    });
  };

  const openThread = (id: string) => {
    setActive(id);
    setPanelOpen(true);
    const t = threads.find((x) => x.id === id);
    if (t?.resolvedAt) setShowResolved(true);
  };

  const startDraft = (anchor: Anchor | null) => {
    setDraft({ anchor });
    setBubble(null);
    setPanelOpen(true);
    setActive(null);
    document.getSelection()?.removeAllRanges();
  };

  const openCount = threads.filter((t) => !t.resolvedAt).length;
  const shown = threads.filter((t) => Boolean(t.resolvedAt) === showResolved);
  const mine = threads.filter((t) => !t.resolvedAt && t.assignee?.id === viewerId);
  const hovered = hover ? threads.find((t) => t.id === hover.id) : null;

  return (
    <div className="2xl:grid 2xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:items-start 2xl:gap-5">
      <article className="card">
        {header}
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPanelOpen(!panelOpen)} aria-expanded={panelOpen} className="btn-ghost min-h-9 gap-1.5 px-3 py-1 text-sm 2xl:hidden">
            <Icon name="comment" />
            {tr("ความคิดเห็น {0}", [openCount])}
          </button>
          {mine.length > 0 && (
            <button type="button" onClick={() => openThread(mine[0].id)} className="badge badge-warning">
              {tr("รอคุณ {0} เรื่อง", [mine.length])}
            </button>
          )}
        </div>
        <div
          ref={bodyRef}
          onClick={(e) => {
            if (!document.getSelection()?.isCollapsed) return;
            const t = threadAt(e.clientX, e.clientY);
            if (t) openThread(t.id);
          }}
          onMouseMove={(e) => {
            const t = threadAt(e.clientX, e.clientY);
            setHover(t ? { x: e.clientX, y: e.clientY, id: t.id } : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {children}
        </div>
      </article>

      {/* ปุ่มลอยเมื่อเลือกข้อความ */}
      {bubble && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => startDraft(bubble.anchor)}
          style={{ left: Math.max(8, bubble.x - 100), top: Math.min(bubble.y, window.innerHeight - 56) }}
          className="tooltip-pop fixed z-[80] inline-flex items-center gap-1.5 rounded-lg bg-tooltip px-3 py-2 text-sm font-medium text-tooltip-foreground shadow-raised"
        >
          <Icon name="comment" />
          {tr("แสดงความคิดเห็น")}
        </button>
      )}

      {/* ชี้ที่ข้อความที่มีความคิดเห็น → ตัวอย่าง */}
      {hovered && hover && !bubble && (
        <div role="tooltip" style={{ left: Math.min(hover.x + 12, window.innerWidth - 300), top: hover.y + 16 }} className="pointer-events-none fixed z-[80] w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-overlay">
          <p className="text-xs font-semibold text-foreground">{hovered.author.name} <span className="font-normal text-subtle">· {tr("{0} คำตอบ", [hovered.replies.length])}</span></p>
          <p className="mt-1 line-clamp-3 text-muted-foreground">{hovered.body}</p>
          <p className="mt-1.5 text-2xs text-subtle">{tr("คลิกเพื่อเปิดเธรด")}</p>
        </div>
      )}

      {/* แผงความคิดเห็น: จอใหญ่อยู่ข้างโน้ตเสมอ · จอเล็กเป็นแผ่นเลื่อนขึ้นเมื่อเปิด */}
      {panelOpen && <button type="button" aria-label={tr("ปิดความคิดเห็น")} onClick={() => setPanelOpen(false)} className="fixed inset-0 z-40 bg-foreground/20 2xl:hidden" />}
      <aside
        aria-label={tr("ความคิดเห็น")}
        className={`${panelOpen ? "fixed" : "hidden"} inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 shadow-overlay lg:inset-y-0 lg:left-auto lg:max-h-none lg:w-[24rem] lg:rounded-none lg:border-y-0 lg:border-r-0 2xl:sticky 2xl:top-6 2xl:z-auto 2xl:block 2xl:max-h-[calc(100vh-3rem)] 2xl:w-auto 2xl:rounded-2xl 2xl:border 2xl:shadow-soft`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon name="comment" className="h-4 w-4 text-primary" />{tr("ความคิดเห็น")}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => startDraft(null)} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("+ ทั้งโน้ต")}</button>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label={tr("ปิด")} className="btn-ghost min-h-8 px-2 py-0.5 text-xs 2xl:hidden">✕</button>
          </div>
        </div>
        <div role="tablist" className="mb-3 flex gap-1 rounded-lg bg-surface-sunken p-1 text-xs">
          <button type="button" role="tab" aria-selected={!showResolved} onClick={() => setShowResolved(false)} className={`flex-1 rounded-md px-2 py-1 font-medium ${!showResolved ? "bg-surface text-foreground shadow-soft" : "text-muted-foreground"}`}>{tr("เปิดอยู่ {0}", [openCount])}</button>
          <button type="button" role="tab" aria-selected={showResolved} onClick={() => setShowResolved(true)} className={`flex-1 rounded-md px-2 py-1 font-medium ${showResolved ? "bg-surface text-foreground shadow-soft" : "text-muted-foreground"}`}>{tr("ปิดแล้ว {0}", [threads.length - openCount])}</button>
        </div>

        {draft && (
          <Composer
            ctx={ctx}
            anchor={draft.anchor}
            onCancel={() => setDraft(null)}
            onSubmit={async (body, assign) => {
              const result = await addNoteComment({ noteId, body, anchor: draft.anchor, assign });
              if (!result.ok) return tr(result.error);
              setDraft(null);
              setShowResolved(false);
              await refresh();
              if (result.id) setActive(result.id);
              return null;
            }}
          />
        )}

        {shown.length === 0 && !draft && (
          <p className="text-sm text-subtle">{showResolved ? tr("ยังไม่มีเธรดที่ปิดแล้ว") : tr("ยังไม่มีความคิดเห็น — เลือกข้อความในโน้ตแล้วกด แสดงความคิดเห็น")}</p>
        )}
        <ul className="space-y-3">
          {shown.map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              active={t.id === active}
              orphaned={Boolean(t.anchor && index && !located.get(t.id))}
              viewerId={viewerId}
              canModerate={canModerate}
              ctx={ctx}
              locale={locale}
              onFocus={() => setActive(t.id)}
              refresh={refresh}
            />
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** เลือกคนและสิ่งที่ขอ (อ่าน / ตรวจ / แก้) */
function AssignFields({ people, value, onChange }: { people: RefContext["people"]; value: { userId: string; kind: AssignKind }; onChange: (v: { userId: string; kind: AssignKind }) => void }) {
  const tr = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <Select size="sm" className="min-w-36 flex-1" value={value.userId} placeholder={tr("มอบหมายให้…")} aria-label={tr("มอบหมายให้")} onChange={(userId) => onChange({ ...value, userId })} options={[{ value: "", label: tr("ไม่มอบหมาย") }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
      {value.userId && (
        <Select size="sm" className="w-32" value={value.kind} aria-label={tr("ขอให้ทำอะไร")} onChange={(kind) => onChange({ ...value, kind: kind as AssignKind })} options={(["READ", "REVIEW", "EDIT"] as const).map((k) => ({ value: k, label: tr(KIND_LABEL[k]) }))} />
      )}
    </div>
  );
}

function Composer({ ctx, anchor, onCancel, onSubmit }: { ctx: RefContext; anchor: Anchor | null; onCancel: () => void; onSubmit: (body: string, assign: { userId: string; kind: AssignKind } | null) => Promise<string | null> }) {
  const tr = useT();
  const [body, setBody] = useState("");
  const [assign, setAssign] = useState<{ userId: string; kind: AssignKind }>({ userId: "", kind: "REVIEW" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(await onSubmit(body, assign.userId ? assign : null));
    });
  return (
    <div className="mb-3 space-y-2 rounded-xl border border-primary/40 bg-primary-soft/30 p-3">
      {anchor ? <blockquote className="line-clamp-3 border-l-2 border-warning pl-2 text-xs text-muted-foreground">{anchor.quote}</blockquote> : <p className="text-xs text-muted-foreground">{tr("ความคิดเห็นถึงทั้งโน้ต")}</p>}
      <RefTextarea teamId={ctx.teamId} autoFocus rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={tr("เขียนความคิดเห็น… (@ แท็กคน)")} aria-label={tr("ความคิดเห็นใหม่")} className="input w-full resize-y py-2 text-sm"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) { e.preventDefault(); submit(); } }} />
      {ctx.people.length > 1 && <AssignFields people={ctx.people} value={assign} onChange={setAssign} />}
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("ยกเลิก")}</button>
        <button type="button" disabled={!body.trim() || pending} onClick={submit} className="btn min-h-9 px-3 py-1 text-sm">{pending ? tr("กำลังส่ง…") : tr("ส่ง")}</button>
      </div>
    </div>
  );
}

function ThreadCard({
  thread: t,
  active,
  orphaned,
  viewerId,
  canModerate,
  ctx,
  locale,
  onFocus,
  refresh,
}: {
  thread: NoteThread;
  active: boolean;
  orphaned: boolean;
  viewerId: string;
  canModerate: boolean;
  ctx: RefContext;
  locale: string;
  onFocus: () => void;
  refresh: () => Promise<void>;
}) {
  const tr = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<null | "reply" | "assign" | "changes" | "edited" | { edit: string }>(null);
  const [text, setText] = useState("");
  const [assign, setAssign] = useState<{ userId: string; kind: AssignKind }>({ userId: t.assignee?.id ?? "", kind: t.assignKind ?? "REVIEW" });
  const when = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) return setError(tr(result.error ?? "เกิดข้อผิดพลาด"));
      setError(null);
      setMode(null);
      setText("");
      await refresh();
    });
  const waitingOnMe = !t.resolvedAt && t.assignee?.id === viewerId && t.assignKind;
  const line = (c: { id: string; body: string; createdAt: string; edited: boolean; author: NoteThread["author"] }, small = false) => (
    <div className="flex gap-2">
      <Avatar user={c.author} size={small ? 20 : 24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-1.5 text-xs">
          <span className="font-semibold text-foreground">{c.author.name}</span>
          <time dateTime={c.createdAt} className="text-subtle">{when(c.createdAt)}</time>
          {c.edited && <span className="text-subtle">{tr("(แก้ไขแล้ว)")}</span>}
          <span className="ml-auto flex gap-2">
            {c.author.id === viewerId && <button type="button" onClick={() => { setMode({ edit: c.id }); setText(c.body); }} className="text-subtle hover:text-primary">{tr("แก้")}</button>}
            {(c.author.id === viewerId || canModerate) && <button type="button" onClick={() => run(() => removeComment(c.id))} className="text-subtle hover:text-danger">{tr("ลบ")}</button>}
          </span>
        </p>
        {typeof mode === "object" && mode?.edit === c.id ? (
          <div className="mt-1 space-y-1.5">
            <RefTextarea teamId={ctx.teamId} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label={tr("แก้ความคิดเห็น")} className="input w-full resize-y py-1.5 text-sm" />
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setMode(null)} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("ยกเลิก")}</button><button type="button" disabled={!text.trim() || pending} onClick={() => run(() => editComment(c.id, text))} className="btn min-h-8 px-2.5 py-0.5 text-xs">{tr("บันทึก")}</button></div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground"><RefText text={c.body} ctx={ctx} /></p>
        )}
      </div>
    </div>
  );

  return (
    <li id={`thread-${t.id}`} onClick={onFocus} className={`scroll-mt-4 rounded-xl border p-3 transition ${active ? "border-warning bg-warning-soft/40" : "border-border bg-surface"} ${t.resolvedAt ? "opacity-80" : ""}`}>
      {t.anchor && (
        <blockquote className="mb-2 line-clamp-2 border-l-2 border-warning pl-2 text-xs text-muted-foreground">
          {orphaned && <span className="mr-1 font-semibold text-danger">{tr("ข้อความเดิมถูกแก้หรือลบ:")}</span>}
          {t.anchor.quote}
        </blockquote>
      )}
      {line(t)}
      {t.assignee && t.assignKind && (
        <p className={`mt-2 inline-flex flex-wrap items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${t.resolvedAt ? "bg-success-soft text-foreground" : "bg-warning-soft text-foreground"}`}>
          {tr(KIND_LABEL[t.assignKind])} → {t.assignee.id === viewerId ? tr("คุณ") : t.assignee.name}
          {t.approvedAt && <span className="text-success">· {tr("ตรวจผ่านแล้ว")}</span>}
        </p>
      )}
      {t.replies.length > 0 && <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">{t.replies.map((r) => <li key={r.id}>{line(r, true)}</li>)}</ul>}
      {t.resolvedAt && t.resolvedBy && <p className="mt-2 text-xs text-subtle">{tr("ปิดโดย {0}", [t.resolvedBy.name])}</p>}

      {waitingOnMe && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {t.assignKind === "READ" && <button type="button" disabled={pending} onClick={() => run(() => completeAssignment(t.id, "read"))} className="btn min-h-8 px-2.5 py-0.5 text-xs">{tr("อ่านแล้ว")}</button>}
          {t.assignKind === "REVIEW" && (
            <>
              <button type="button" disabled={pending} onClick={() => run(() => completeAssignment(t.id, "approve"))} className="btn min-h-8 px-2.5 py-0.5 text-xs">{tr("ผ่าน")}</button>
              <button type="button" onClick={() => setMode("changes")} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("ขอแก้")}</button>
            </>
          )}
          {t.assignKind === "EDIT" && <button type="button" onClick={() => setMode("edited")} className="btn min-h-8 px-2.5 py-0.5 text-xs">{tr("แก้แล้ว")}</button>}
        </div>
      )}

      {(mode === "reply" || mode === "changes" || mode === "edited") && (
        <div className="mt-2 space-y-1.5">
          <RefTextarea teamId={ctx.teamId} autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} aria-label={tr(mode === "changes" ? "สิ่งที่ต้องแก้" : "ตอบ")} placeholder={tr(mode === "changes" ? "บอกสิ่งที่ต้องแก้…" : mode === "edited" ? "บอกสิ่งที่แก้ (ไม่บังคับ)…" : "ตอบ… (@ แท็กคน)")} className="input w-full resize-y py-1.5 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("ยกเลิก")}</button>
            <button
              type="button"
              disabled={pending || (mode !== "edited" && !text.trim())}
              onClick={() => run(() => (mode === "reply" ? addNoteComment({ noteId: "", parentId: t.id, body: text }) : completeAssignment(t.id, mode, text)))}
              className="btn min-h-8 px-2.5 py-0.5 text-xs"
            >
              {tr(mode === "reply" ? "ส่ง" : mode === "changes" ? "ส่งกลับให้แก้" : "ส่งกลับให้ตรวจ")}
            </button>
          </div>
        </div>
      )}
      {mode === "assign" && (
        <div className="mt-2 space-y-1.5">
          <AssignFields people={ctx.people} value={assign} onChange={setAssign} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode(null)} className="btn-ghost min-h-8 px-2.5 py-0.5 text-xs">{tr("ยกเลิก")}</button>
            <button type="button" disabled={pending} onClick={() => run(() => assignThread(t.id, assign.userId ? assign : null))} className="btn min-h-8 px-2.5 py-0.5 text-xs">{tr("ตกลง")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{error}</p>}

      {mode === null && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs font-medium text-muted-foreground">
          {!t.resolvedAt && <button type="button" onClick={() => setMode("reply")} className="hover:text-primary">{tr("ตอบ")}</button>}
          {!t.resolvedAt && ctx.people.length > 1 && <button type="button" onClick={() => setMode("assign")} className="hover:text-primary">{t.assignee ? tr("เปลี่ยนคนที่มอบหมาย") : tr("มอบหมาย")}</button>}
          <button type="button" disabled={pending} onClick={() => run(() => resolveThread(t.id, !t.resolvedAt))} className="hover:text-primary">{t.resolvedAt ? tr("เปิดอีกครั้ง") : tr("แก้ไขแล้ว · ปิดเธรด")}</button>
        </div>
      )}
    </li>
  );
}
