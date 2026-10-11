"use client";

import { useActionState } from "react";
import { createNote } from "@/app/actions/notes";
import { FormMessage } from "@/components/form";
import { Select } from "@/components/select";

type Folder = { id: string; label: string };

/** สร้างโน้ตหรือโฟลเดอร์ใหม่ในทีม — เลือกโฟลเดอร์ที่จะวางได้ */
export function NewItemForm({ teamId, folders, parentId, title = "", autoFocus = false }: { teamId: string; folders: Folder[]; parentId?: string | null; title?: string; autoFocus?: boolean }) {
  const [state, action] = useActionState(createNote, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input name="title" className="input py-2" maxLength={120} required autoFocus={autoFocus} defaultValue={title} placeholder="ชื่อโน้ตหรือโฟลเดอร์ใหม่" aria-label="ชื่อโน้ตหรือโฟลเดอร์ใหม่" />
      {folders.length > 0 && (
        <Select name="parentId" defaultValue={parentId ?? ""} aria-label="สร้างไว้ในโฟลเดอร์" options={[{ value: "", label: "ระดับบนสุด" }, ...folders.map((f) => ({ value: f.id, label: f.label }))]} />
      )}
      <div className="flex gap-2">
        <button name="kind" value="NOTE" className="btn min-h-9 flex-1 px-3 py-1.5 text-sm">+ โน้ต</button>
        <button name="kind" value="FOLDER" className="btn-ghost min-h-9 flex-1 px-3 py-1.5 text-sm">+ โฟลเดอร์</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
