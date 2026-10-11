"use client";

import { useActionState } from "react";
import { createNote, deleteNote, moveNote, renameFolder } from "@/app/actions/notes";
import { FormMessage, SubmitButton } from "@/components/form";

type Folder = { id: string; label: string };

/** สร้างโน้ตหรือโฟลเดอร์ใหม่ในทีม — เลือกโฟลเดอร์ที่จะวางได้ */
export function NewItemForm({ teamId, folders, parentId, title = "" }: { teamId: string; folders: Folder[]; parentId?: string | null; title?: string }) {
  const [state, action] = useActionState(createNote, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input name="title" className="input py-2" maxLength={120} required defaultValue={title} placeholder="ชื่อโน้ตหรือโฟลเดอร์ใหม่" aria-label="ชื่อโน้ตหรือโฟลเดอร์ใหม่" />
      {folders.length > 0 && (
        <select name="parentId" className="input py-2" defaultValue={parentId ?? ""} aria-label="สร้างไว้ในโฟลเดอร์">
          <option value="">ระดับบนสุด</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <button name="kind" value="NOTE" className="btn min-h-9 flex-1 px-3 py-1.5 text-sm">+ โน้ต</button>
        <button name="kind" value="FOLDER" className="btn-ghost min-h-9 flex-1 px-3 py-1.5 text-sm">+ โฟลเดอร์</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** ย้ายไปโฟลเดอร์อื่น */
export function MoveForm({ id, folders, parentId }: { id: string; folders: Folder[]; parentId: string | null }) {
  const [state, action] = useActionState(moveNote, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="parentId" className="input w-auto min-w-40 flex-1 py-2" defaultValue={parentId ?? ""} aria-label="ย้ายไปโฟลเดอร์">
        <option value="">ระดับบนสุด</option>
        {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <SubmitButton className="btn-ghost" pendingText="กำลังย้าย...">ย้าย</SubmitButton>
      <span className="basis-full empty:hidden"><FormMessage state={state} /></span>
    </form>
  );
}

export function RenameFolderForm({ id, title }: { id: string; title: string }) {
  const [state, action] = useActionState(renameFolder, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="title" className="input w-auto min-w-40 flex-1 py-2" defaultValue={title} maxLength={120} required aria-label="ชื่อโฟลเดอร์" />
      <SubmitButton className="btn-ghost">เปลี่ยนชื่อ</SubmitButton>
      <span className="basis-full empty:hidden"><FormMessage state={state} /></span>
    </form>
  );
}

/** ลบโน้ต หรือโฟลเดอร์พร้อมทุกอย่างข้างใน — ถามยืนยันก่อน */
export function DeleteNoteButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(deleteNote, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <details className="group">
        <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-sm text-slate-400 transition marker:hidden hover:text-rose-600">ลบ</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span>{label}</span>
          <SubmitButton className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50" pendingText="กำลังลบ...">ยืนยันการลบ</SubmitButton>
        </div>
      </details>
      <span className="basis-full empty:hidden"><FormMessage state={state} /></span>
    </form>
  );
}
