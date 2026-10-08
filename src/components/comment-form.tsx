"use client";

import { useActionState, useState } from "react";
import { addComment, deleteComment } from "@/app/actions/comments";
import type { FormState } from "@/app/actions/auth";
import type { CommentTarget } from "@/lib/comments";
import { uploadFiles } from "@/lib/upload-client";
import { FilePicker, PickedFiles } from "@/components/attachments";
import { SubmitButton } from "@/components/form";

export function CommentForm({ target, label, canAttach }: { target: CommentTarget; label: string; canAttach: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // สร้างความคิดเห็นก่อน แล้วอัปโหลดไฟล์ที่เลือกไว้เข้าไปใต้ความคิดเห็นนั้น
  const submit = async (prev: FormState, formData: FormData): Promise<FormState> => {
    if (files.length > 0) formData.set("hasFiles", "1");
    const result = await addComment(prev, formData);
    if (!result?.id || files.length === 0) return result;
    const { uploaded, errors } = await uploadFiles({ commentId: result.id }, files);
    setFiles([]);
    if (errors.length === 0) return result;
    // ความคิดเห็นที่มีแต่ไฟล์ แต่ไฟล์ขึ้นไม่ได้เลย — ไม่ทิ้งความคิดเห็นเปล่าไว้
    if (uploaded === 0 && !String(formData.get("body") ?? "").trim()) {
      const id = new FormData();
      id.set("id", result.id);
      await deleteComment(id);
    }
    return { error: errors.join(" · ") };
  };
  // ส่งสำเร็จแล้วฟอร์มล้างตัวเอง (React รีเซ็ตฟอร์มหลัง action) — แสดงเฉพาะข้อผิดพลาด
  const [state, action] = useActionState(submit, undefined);
  const [name, id] = Object.entries(target)[0];
  const error = fileError ?? state?.error;

  return (
    <form action={action} className="space-y-1.5">
      <input type="hidden" name={name} value={id} />
      <div className="flex items-end gap-2">
        <textarea
          name="body"
          rows={1}
          maxLength={2000}
          required={files.length === 0}
          aria-label={label}
          placeholder="เขียนความคิดเห็น… (วางลิงก์ได้)"
          className="input min-h-10 flex-1 resize-y py-2 text-sm"
        />
        {canAttach && (
          <FilePicker
            files={files}
            onChange={(next, problem) => {
              setFiles(next);
              setFileError(problem);
            }}
          />
        )}
        <SubmitButton className="btn-ghost min-h-10 shrink-0 px-3 text-sm" pendingText="กำลังส่ง…">ส่ง</SubmitButton>
      </div>
      <PickedFiles files={files} onRemove={(i) => setFiles(files.filter((_, n) => n !== i))} />
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
    </form>
  );
}
