"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { deleteAttachment, setAttachmentImportant } from "@/app/actions/attachments";
import { MAX_FILES_PER_UPLOAD, formatBytes, type AttachmentTarget, type FileItem } from "@/lib/attachments";
import { checkFiles, uploadFiles } from "@/lib/upload-client";
import { Icon } from "@/components/icons";

type Menu = { file: FileItem; x: number; y: number };

/**
 * ไฟล์แนบเป็นชิป — คลิก = เปิดไฟล์ · คลิกขวา (หรือปุ่ม ⋯ / กดค้างบนมือถือ) = เมนู mark สำคัญ / ดาวน์โหลด / ลบ
 * ไฟล์ที่ไม่ได้ mark จะถูกลบเองเมื่อครบกำหนด
 */
export function AttachmentList({ files, canModerate = false }: { files: FileItem[]; canModerate?: boolean }) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (files.length === 0) return null;

  const openMenu = (file: FileItem, x: number, y: number) => {
    setError(null);
    // กันเมนูล้นขอบจอ
    setMenu({ file, x: Math.min(x, window.innerWidth - 232), y: Math.min(y, window.innerHeight - 190) });
  };
  const run = (action: () => Promise<{ ok: boolean }>, failMessage: string) =>
    start(async () => {
      const result = await action();
      if (!result.ok) setError(failMessage);
    });

  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100";
  return (
    <div className={pending ? "opacity-60" : ""}>
      <ul className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <li
            key={f.id}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(f, e.clientX, e.clientY);
            }}
            className={`inline-flex max-w-full items-center rounded-xl border text-xs ${f.important ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
          >
            <a
              href={`/api/files/${f.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title={f.important ? "ไฟล์สำคัญ — เก็บไว้ถาวร" : `ไฟล์ชั่วคราว — จะถูกลบในอีก ${f.daysLeft} วัน (คลิกขวาเพื่อ mark ว่าสำคัญ)`}
              className="flex min-w-0 items-center gap-1.5 py-1.5 pl-2.5 pr-1 hover:text-indigo-700"
            >
              {f.important ? <Icon name="star" filled className="h-3.5 w-3.5 text-amber-500" /> : <Icon name={f.isImage ? "image" : "paperclip"} className="h-3.5 w-3.5 text-slate-400" />}
              <span className="truncate font-medium text-slate-800">{f.name}</span>
              <span className="shrink-0 text-slate-400">
                {formatBytes(f.size)}
                {!f.important && ` · เหลือ ${f.daysLeft} วัน`}
              </span>
            </a>
            <button
              type="button"
              aria-label={`ตัวเลือกของไฟล์ ${f.name}`}
              aria-haspopup="menu"
              onClick={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                openMenu(f, box.left, box.bottom + 4);
              }}
              className="shrink-0 rounded-r-xl px-1.5 py-1.5 text-slate-400 transition hover:text-slate-700"
            >
              <Icon name="dots" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 text-xs font-medium text-rose-700">{error}</p>}
      {/* วางที่ body: .card มี transform (animation) ซึ่งทำให้ position: fixed ข้างในอ้างอิงการ์ดแทนหน้าจอ */}
      {menu && createPortal(
        <div
          role="menu"
          aria-label={`ตัวเลือกของไฟล์ ${menu.file.name}`}
          style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
          className="fixed z-50 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => run(() => setAttachmentImportant(menu.file.id, !menu.file.important), "บันทึกไม่สำเร็จ")}
          >
            <Icon name="star" filled={!menu.file.important} className={`h-4 w-4 ${menu.file.important ? "text-slate-400" : "text-amber-500"}`} />
            {menu.file.important ? "เลิก mark ว่าสำคัญ" : "Mark ว่าสำคัญ (เก็บไว้)"}
          </button>
          <a role="menuitem" className={item} href={`/api/files/${menu.file.id}`} target="_blank" rel="noopener noreferrer"><Icon name="open" className="h-4 w-4 text-slate-400" />เปิดไฟล์</a>
          <a role="menuitem" className={item} href={`/api/files/${menu.file.id}?download=1`}><Icon name="download" className="h-4 w-4 text-slate-400" />ดาวน์โหลด</a>
          {(canModerate || menu.file.mine) && (
            <button
              type="button"
              role="menuitem"
              className={`${item} text-rose-700 hover:bg-rose-50`}
              onClick={() => run(() => deleteAttachment(menu.file.id), "ลบไฟล์ไม่สำเร็จ")}
            >
              <Icon name="trash" />ลบไฟล์
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** ปุ่ม 📎 เลือกไฟล์ (ยังไม่อัปโหลด) — ใช้ในฟอร์มที่ต้องสร้างงาน/ความคิดเห็นก่อนแล้วค่อยแนบ */
export function FilePicker({
  files,
  onChange,
  label = "แนบไฟล์",
  text,
  className = "btn-ghost min-h-10 shrink-0 gap-1.5 px-3 text-sm",
}: {
  files: File[];
  onChange: (files: File[], error: string | null) => void;
  label?: string;
  /** ข้อความข้างไอคอน — ไม่ใส่ = แสดงจำนวนไฟล์ที่เลือกไว้ */
  text?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const next = [...files, ...Array.from(e.target.files ?? [])].slice(0, MAX_FILES_PER_UPLOAD + 1);
          e.target.value = "";
          const error = checkFiles(next);
          onChange(error ? files : next, error);
        }}
      />
      <button type="button" className={className} onClick={() => input.current?.click()} aria-label={label} title={label}>
        <Icon name="paperclip" />
        {text ?? (files.length > 0 ? files.length : null)}
      </button>
    </>
  );
}

/** รายการไฟล์ที่เลือกไว้รออัปโหลด (กด × เอาออกได้) */
export function PickedFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {files.map((f, i) => (
        <li key={`${f.name}:${i}`} className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white py-1 pl-2.5 pr-1 text-xs">
          <span className="truncate text-slate-700">{f.name}</span>
          <span className="shrink-0 text-slate-400">{formatBytes(f.size)}</span>
          <button type="button" onClick={() => onRemove(i)} aria-label={`เอา ${f.name} ออก`} className="shrink-0 px-1.5 text-slate-400 hover:text-rose-600">×</button>
        </li>
      ))}
    </ul>
  );
}

/** แนบไฟล์เข้ากับสิ่งที่มีอยู่แล้ว (เช่น งาน) — เลือกแล้วอัปโหลดทันที */
export function AttachButton({ target }: { target: AttachmentTarget }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <FilePicker
        files={[]}
        label="แนบไฟล์กับงานนี้"
        text="แนบไฟล์"
        className="inline-flex min-h-8 items-center gap-1 rounded-lg text-xs font-medium text-slate-400 transition hover:text-indigo-700 disabled:opacity-50"
        onChange={async (files, problem) => {
          setError(problem);
          if (problem || files.length === 0 || busy) return;
          setBusy(true);
          const result = await uploadFiles(target, files);
          setBusy(false);
          if (result.errors.length > 0) setError(result.errors.join(" · "));
        }}
      />
      {busy && <span className="text-xs text-slate-500">กำลังอัปโหลด…</span>}
      {error && <span role="alert" className="text-xs font-medium text-rose-700">{error}</span>}
    </span>
  );
}
