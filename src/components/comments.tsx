import { deleteComment } from "@/app/actions/comments";
import type { CommentRow, CommentTarget } from "@/lib/comments";
import { formatDateKey, formatDateTime } from "@/lib/format-dates";
import { dateToKey } from "@/lib/dates";
import { isPostpone } from "@/lib/tasks";
import { EditableComment } from "@/components/editable-comment";
import { refContext } from "@/lib/ref-context";
import { Avatar } from "@/components/avatar";
import { CommentForm } from "@/components/comment-form";
import { ReplyBox } from "@/components/reply-box";
import { Icon } from "@/components/icons";
import { AttachmentList } from "@/components/attachments";
import { RefText, type RefContext } from "@/components/ref-text";
import { toFileItems } from "@/lib/attachments";
import { tr } from "@/lib/i18n/server";

/** ข้อความที่ลิงก์ (http/https) กดได้ — ใช้เมื่อไม่มีข้อมูลพื้นที่ให้แสดง #งาน [[โน้ต]] @คน */
export function LinkedText({ text, ctx }: { text: string; ctx?: RefContext | null }) {
  return <RefText text={text} ctx={ctx} />;
}

/**
 * เธรดความคิดเห็นใต้งานหรือเช็กอิน — พับไว้ก่อน แสดงจำนวนที่หัวข้อ
 * ตอบเป็นเธรดได้ชั้นเดียว · teamId มีค่า = @ แท็กคน และ #งาน [[โน้ต]] เป็นป้ายที่กดได้
 */
export async function CommentThread({
  target,
  comments,
  viewerId,
  canModerate = false,
  subject,
  open = false,
  canAttach,
  teamId,
}: {
  target: CommentTarget;
  comments: CommentRow[];
  viewerId: string;
  /** ลบความคิดเห็นของคนอื่นได้ (คนที่ดูแลทีม) */
  canModerate?: boolean;
  /** ใช้ใน aria-label ของช่องพิมพ์ เช่น ชื่องาน */
  subject: string;
  open?: boolean;
  /** ตั้งค่าที่เก็บไฟล์แล้ว — แสดงปุ่มแนบไฟล์ */
  canAttach: boolean;
  teamId?: string | null;
}) {
  const ctx = teamId ? await refContext(teamId) : null;
  const roots = comments.filter((c) => !c.parentId || !comments.some((p) => p.id === c.parentId));
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  const line = (c: CommentRow, small = false) => (
    <div className="flex gap-2.5">
      <Avatar user={c.author} size={small ? 20 : 24} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <EditableComment
          id={c.id}
          body={c.body}
          canEdit={c.author.id === viewerId}
          entry={c.progressTo !== null || c.dueChange}
          edited={Boolean(c.editedAt)}
          header={
            <>
              <span className="font-semibold text-foreground">{c.author.name}</span>
              <time dateTime={c.createdAt.toISOString()} className="text-subtle">{formatDateTime(c.createdAt)}</time>
            </>
          }
          actions={
            (canModerate || c.author.id === viewerId) && (
              <form action={deleteComment}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-subtle transition hover:text-danger" aria-label={tr("ลบความคิดเห็นของ {0}", [c.author.name])}>{tr("ลบ")}</button>
              </form>
            )
          }
          badge={
            c.progressTo !== null ? (
              <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-lg bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground ring-1 ring-border">
                <span className="font-medium text-muted-foreground">{tr("ความคืบหน้า")}</span>
                {c.progressFrom !== null && c.progressFrom !== c.progressTo && <><span className="text-subtle">{c.progressFrom}%</span><span aria-hidden="true" className="text-subtle">→</span></>}
                <span className={c.progressTo >= 100 ? "text-success" : "text-primary"}>{c.progressTo}%</span>
              </p>
            ) : c.dueChange ? (
              <p className="mt-0.5 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-surface px-2 py-0.5 text-xs font-semibold text-foreground ring-1 ring-border">
                <span className="font-medium text-muted-foreground">{tr("กำหนดส่ง")}</span>
                <span className="text-subtle">{c.dueFrom ? formatDateKey(dateToKey(c.dueFrom)) : tr("ไม่มี")}</span>
                <span aria-hidden="true" className="text-subtle">→</span>
                <span className={isPostpone(c.dueFrom && dateToKey(c.dueFrom), c.dueTo && dateToKey(c.dueTo)) ? "text-warning" : "text-primary"}>{c.dueTo ? formatDateKey(dateToKey(c.dueTo)) : tr("ไม่มี")}</span>
              </p>
            ) : null
          }
        >
          {c.body && <p className="whitespace-pre-wrap break-words text-sm text-foreground"><RefText text={c.body} ctx={ctx} /></p>}
        </EditableComment>
        <CommentFiles comment={c} viewerId={viewerId} canModerate={canModerate} />
      </div>
    </div>
  );

  return (
    <details open={open} className="group/thread">
      <summary className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg text-xs font-medium transition hover:text-primary-strong ${comments.length > 0 ? "text-primary" : "text-subtle"}`}>
        <Icon name="comment" />
        {comments.length > 0 ? tr("ความคิดเห็น {0}", [comments.length]) : tr("แสดงความคิดเห็น")}
      </summary>
      <div className="mt-2 space-y-3 rounded-xl bg-surface-sunken p-3">
        {roots.length > 0 && (
          <ul className="space-y-3">
            {roots.map((c) => {
              const replies = repliesOf(c.id);
              return (
                <li key={c.id}>
                  {line(c)}
                  {replies.length > 0 && (
                    <ul className="ml-8 mt-2 space-y-2 border-l-2 border-border pl-3">
                      {replies.map((r) => <li key={r.id}>{line(r, true)}</li>)}
                    </ul>
                  )}
                  {/* รายการอัปเดตความคืบหน้าไม่ใช่บทสนทนา — ไม่มีปุ่มตอบ */}
                  {c.progressTo === null && !c.dueChange && (
                    <div className="ml-8 mt-1">
                      <ReplyBox target={target} parentId={c.id} label={tr("ตอบ {0}", [c.author.name])} teamId={teamId ?? null} canAttach={canAttach} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <CommentForm target={target} label={tr("ความคิดเห็นถึง {0}", [subject])} canAttach={canAttach} teamId={teamId ?? null} />
      </div>
    </details>
  );
}

function CommentFiles({ comment, viewerId, canModerate }: { comment: CommentRow; viewerId: string; canModerate: boolean }) {
  const files = toFileItems(comment.attachments, viewerId);
  // ความคิดเห็นที่มีแต่ไฟล์ และไฟล์ชั่วคราวนั้นหมดอายุไปแล้ว
  if (files.length === 0) return comment.body || comment.progressTo !== null || comment.dueChange ? null : <p className="text-sm italic text-subtle">{tr("ไฟล์แนบหมดอายุแล้ว")}</p>;
  return <div className="mt-1"><AttachmentList files={files} canModerate={canModerate} /></div>;
}
