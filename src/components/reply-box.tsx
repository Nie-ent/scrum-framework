"use client";

import { useState } from "react";
import type { CommentTarget } from "@/lib/comments";
import { CommentForm } from "@/components/comment-form";
import { useT } from "@/components/i18n";

/** ปุ่ม "ตอบ" ใต้ความคิดเห็น — กดแล้วเปิดช่องตอบในเธรดนั้น */
export function ReplyBox({ target, parentId, label, teamId, canAttach }: { target: CommentTarget; parentId: string; label: string; teamId: string | null; canAttach: boolean }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-muted-foreground transition hover:text-primary">
        {tr("ตอบ")}
      </button>
    );
  }
  return <CommentForm target={target} parentId={parentId} label={label} teamId={teamId} canAttach={canAttach} autoFocus onDone={() => setOpen(false)} />;
}
