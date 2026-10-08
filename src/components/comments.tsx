import { deleteComment } from "@/app/actions/comments";
import type { CommentRow, CommentTarget } from "@/lib/comments";
import { formatDateTime } from "@/lib/dates";
import { Avatar } from "@/components/avatar";
import { CommentForm } from "@/components/comment-form";
import { AttachmentList } from "@/components/attachments";
import { toFileItems } from "@/lib/attachments";

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;

/** ข้อความที่ลิงก์ (http/https) กดได้ — เครื่องหมายวรรคตอนท้ายลิงก์ไม่นับเป็นส่วนของลิงก์ */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {text.split(URL_PATTERN).map((part, i) => {
        if (i % 2 === 0) return part;
        const href = part.replace(/[.,;:!?)\]]+$/, "");
        return (
          <span key={i}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-indigo-600 underline underline-offset-2 hover:text-indigo-800">
              {href}
            </a>
            {part.slice(href.length)}
          </span>
        );
      })}
    </>
  );
}

/** เธรดความคิดเห็นใต้งานหรือเช็กอิน — พับไว้ก่อน แสดงจำนวนที่หัวข้อ */
export function CommentThread({
  target,
  comments,
  viewerId,
  canModerate = false,
  subject,
  open = false,
  canAttach,
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
}) {
  return (
    <details open={open} className="group/thread">
      <summary className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg text-xs font-medium transition hover:text-indigo-700 ${comments.length > 0 ? "text-indigo-600" : "text-slate-400"}`}>
        <span aria-hidden="true">💬</span>
        {comments.length > 0 ? `ความคิดเห็น ${comments.length}` : "แสดงความคิดเห็น"}
      </summary>
      <div className="mt-2 space-y-3 rounded-xl bg-slate-50 p-3">
        {comments.length > 0 && (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <Avatar user={c.author} size={24} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold text-slate-800">{c.author.name}</span>
                    <time dateTime={c.createdAt.toISOString()} className="text-slate-400">{formatDateTime(c.createdAt)}</time>
                    {(canModerate || c.author.id === viewerId) && (
                      <form action={deleteComment} className="ml-auto">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-slate-400 transition hover:text-rose-600" aria-label={`ลบความคิดเห็นของ ${c.author.name}`}>ลบ</button>
                      </form>
                    )}
                  </div>
                  {c.body && <p className="whitespace-pre-wrap break-words text-sm text-slate-700"><LinkedText text={c.body} /></p>}
                  <CommentFiles comment={c} viewerId={viewerId} canModerate={canModerate} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <CommentForm target={target} label={`ความคิดเห็นถึง ${subject}`} canAttach={canAttach} />
      </div>
    </details>
  );
}

function CommentFiles({ comment, viewerId, canModerate }: { comment: CommentRow; viewerId: string; canModerate: boolean }) {
  const files = toFileItems(comment.attachments, viewerId);
  // ความคิดเห็นที่มีแต่ไฟล์ และไฟล์ชั่วคราวนั้นหมดอายุไปแล้ว
  if (files.length === 0) return comment.body ? null : <p className="text-sm italic text-slate-400">ไฟล์แนบหมดอายุแล้ว</p>;
  return <div className="mt-1"><AttachmentList files={files} canModerate={canModerate} /></div>;
}
