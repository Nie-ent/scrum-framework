"use client";

import { useEffect, useState, useTransition } from "react";
import { moveNote } from "@/app/actions/notes";
import { useT } from "@/components/i18n";

const TYPE = "application/x-pace-note";
const TOAST = "pace-note-toast";
/** id ของรายการที่กำลังถูกลาก (อ่านจาก dataTransfer ระหว่างลากไม่ได้ จึงจำไว้ตรงนี้) */
let dragging: string | null = null;

export const noteToast = (text: string, error = false) => window.dispatchEvent(new CustomEvent(TOAST, { detail: { text, error } }));

/** ทำให้แถวโน้ต/โฟลเดอร์ลากได้ */
export function dragProps(id: string, title: string) {
  return {
    draggable: true,
    onDragStart(e: React.DragEvent) {
      dragging = id;
      e.dataTransfer.setData(TYPE, id);
      e.dataTransfer.setData("text/plain", title);
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    },
    onDragEnd() {
      dragging = null;
    },
  };
}

/** ทำให้โฟลเดอร์ (หรือระดับบนสุด เมื่อ parentId = null) รับรายการที่ลากมาวางได้ */
export function useDrop(parentId: string | null) {
  const tr = useT();
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  return {
    over,
    pending,
    props: {
      onDragOver(e: React.DragEvent) {
        if (!e.dataTransfer.types.includes(TYPE) || dragging === parentId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave(e: React.DragEvent) {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop(e: React.DragEvent) {
        const id = e.dataTransfer.getData(TYPE);
        setOver(false);
        if (!id || id === parentId) return;
        e.preventDefault();
        start(async () => {
          const data = new FormData();
          data.set("id", id);
          data.set("parentId", parentId ?? "");
          const result = await moveNote(undefined, data);
          if (result?.error) noteToast(result.error, true);
          else noteToast(tr("ย้ายแล้ว"));
        });
      },
    },
  };
}

/** ข้อความสั้น ๆ หลังลากวาง (สำเร็จ / ย้ายไม่ได้เพราะอะไร) */
export function NoteToast() {
  const tr = useT();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (e: Event) => {
      setMessage((e as CustomEvent).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 3500);
    };
    window.addEventListener(TOAST, show);
    return () => {
      window.removeEventListener(TOAST, show);
      clearTimeout(timer);
    };
  }, []);
  if (!message) return null;
  return (
    <div role="status" className={`fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium shadow-overlay lg:bottom-8 ${message.error ? "bg-danger text-primary-foreground" : "bg-tooltip text-tooltip-foreground"}`}>
      {tr(message.text)}
    </div>
  );
}
