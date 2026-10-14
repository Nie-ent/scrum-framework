import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_TESTS } from "./setup";
import { makeWorld } from "./fixtures";
import { prisma } from "@/lib/db";
import { addCommentFor, assignThreadFor, canDeleteComment, completeAssignmentFor, editCommentFor, noteThreadsFor, resolveThreadFor } from "@/lib/comment-ops";
import { createTaskFor } from "@/lib/task-ops";

describe.skipIf(!DB_TESTS)("comments: note threads, mentions, assignments", () => {
  let w: Awaited<ReturnType<typeof makeWorld>>;
  let author: { id: string }, reviewer: { id: string }, other: { id: string }, outsider: { id: string };
  let team: { id: string };
  let noteId: string;

  beforeAll(async () => {
    w = await makeWorld();
    author = await w.user("Author");
    reviewer = await w.user("Rita Review");
    other = await w.user("Oscar");
    outsider = await w.user("Outsider");
    team = await w.team("Docs", [[author, "MEMBER"], [reviewer, "MEMBER"], [other, "MEMBER"]]);
    await w.team("Elsewhere", [[outsider, "MEMBER"]]);
    noteId = (await prisma.note.create({ data: { teamId: team.id, kind: "NOTE", title: "Spec", content: "Ship it on Friday.", createdById: author.id } })).id;
  });
  afterAll(async () => w?.cleanup());

  const anchor = { quote: "Friday", prefix: "Ship it on ", suffix: "." };

  it("anchors a thread, tags people and notifies them once", async () => {
    const result = await addCommentFor(await w.as(other.id), { target: { noteId }, body: "Is this right @Rita Review?", anchor });
    expect(result.ok).toBe(true);
    const id = result.ok ? result.id : "";
    const notices = await w.notices(reviewer.id);
    expect(notices.map((n) => n.title)).toEqual([expect.stringContaining("Oscar กล่าวถึงคุณในโน้ต Spec")]);
    expect(notices[0].url).toBe(`/notes/${noteId}?c=${id}`);
    // เจ้าของโน้ตได้แจ้งว่ามีความคิดเห็นใหม่
    expect((await w.notices(author.id)).at(-1)?.title).toBe("Oscar แสดงความคิดเห็น");
    // คนนอกพื้นที่คอมเมนต์ไม่ได้ และแท็กคนนอกไม่มีผล
    expect(await addCommentFor(await w.as(outsider.id), { target: { noteId }, body: "hi" })).toMatchObject({ ok: false });
    // ตอบในเธรด: ยึดข้อความไม่ได้ · คนในเธรดได้แจ้ง
    expect(await addCommentFor(await w.as(author.id), { parentId: id, body: "x", anchor })).toMatchObject({ ok: false });
    expect(await addCommentFor(await w.as(author.id), { parentId: id, body: "Yes, Friday." })).toMatchObject({ ok: true });
    expect((await w.notices(other.id)).at(-1)?.title).toBe("Author ตอบความคิดเห็น");

    const threads = await noteThreadsFor(await w.as(reviewer.id), noteId);
    expect(threads?.[0]).toMatchObject({ anchor, body: "Is this right @Rita Review?", replies: [{ body: "Yes, Friday." }] });
    expect(await noteThreadsFor(await w.as(outsider.id), noteId)).toBeNull();
  });

  it("runs a review round trip: ask → request changes → edited → approve", async () => {
    const asked = await addCommentFor(await w.as(author.id), { target: { noteId }, body: "Please review", assign: { userId: reviewer.id, kind: "REVIEW" } });
    const id = asked.ok ? asked.id : "";
    expect((await w.notices(reviewer.id)).at(-1)?.title).toBe("Author ขอให้คุณตรวจ: Spec");
    // คนอื่นทำแทนผู้รับมอบหมายไม่ได้ · ทำผิดประเภทไม่ได้
    expect(await completeAssignmentFor(await w.as(other.id), id, "approve")).toMatchObject({ ok: false });
    expect(await completeAssignmentFor(await w.as(reviewer.id), id, "read")).toMatchObject({ ok: false });
    expect(await completeAssignmentFor(await w.as(reviewer.id), id, "changes", "")).toMatchObject({ ok: false });

    const authorBefore = (await w.notices(author.id)).length;
    expect(await completeAssignmentFor(await w.as(reviewer.id), id, "changes", "Fix the date")).toEqual({ ok: true });
    // แจ้งครั้งเดียว ("ขอให้คุณแก้") ไม่ใช่ "ตอบความคิดเห็น" ซ้ำอีกอัน
    expect((await w.notices(author.id)).slice(authorBefore).map((n) => n.title)).toEqual(["Rita Review ขอให้คุณแก้: Spec"]);
    let root = await prisma.comment.findUniqueOrThrow({ where: { id } });
    expect([root.assigneeId, root.assignKind, root.assignedById]).toEqual([author.id, "EDIT", reviewer.id]);

    const reviewerBefore = (await w.notices(reviewer.id)).length;
    expect(await completeAssignmentFor(await w.as(author.id), id, "edited", "Done")).toEqual({ ok: true });
    expect((await w.notices(reviewer.id)).slice(reviewerBefore).map((n) => n.title)).toEqual(["Author ขอให้คุณตรวจ: Spec"]);
    root = await prisma.comment.findUniqueOrThrow({ where: { id } });
    expect([root.assigneeId, root.assignKind]).toEqual([reviewer.id, "REVIEW"]);

    expect(await completeAssignmentFor(await w.as(reviewer.id), id, "approve")).toEqual({ ok: true });
    root = await prisma.comment.findUniqueOrThrow({ where: { id } });
    expect(root.resolvedAt).not.toBeNull();
    expect(root.approvedAt).not.toBeNull();
    expect((await w.notices(author.id)).at(-1)?.title).toBe("Rita Review ตรวจผ่านแล้ว: Spec");
    expect(await prisma.comment.count({ where: { parentId: id } })).toBe(2);
  });

  it("assigns, reopens, edits and deletes with the right people", async () => {
    const made = await addCommentFor(await w.as(other.id), { target: { noteId }, body: "General thought" });
    const id = made.ok ? made.id : "";
    expect(await assignThreadFor(await w.as(author.id), id, { userId: outsider.id, kind: "READ" })).toMatchObject({ ok: false });
    expect(await assignThreadFor(await w.as(author.id), id, { userId: reviewer.id, kind: "READ" })).toEqual({ ok: true });
    expect(await completeAssignmentFor(await w.as(reviewer.id), id, "read")).toEqual({ ok: true });
    expect(await resolveThreadFor(await w.as(author.id), id, false)).toEqual({ ok: true });
    expect((await prisma.comment.findUniqueOrThrow({ where: { id } })).resolvedAt).toBeNull();

    expect(await editCommentFor(await w.as(author.id), id, "hacked")).toMatchObject({ ok: false });
    expect(await editCommentFor(await w.as(other.id), id, "Thought, now with @Author")).toEqual({ ok: true });
    expect((await prisma.comment.findUniqueOrThrow({ where: { id } })).editedAt).not.toBeNull();
    expect(await prisma.ref.count({ where: { fromCommentId: id, toUserId: author.id } })).toBe(1);

    expect(await canDeleteComment(await w.as(reviewer.id), id)).toBeNull();
    expect(await canDeleteComment(await w.as(other.id), id)).not.toBeNull();
  });

  it("threads replies under task comments too, without anchors or assignment", async () => {
    const task = await createTaskFor(await w.as(author.id), { teamId: team.id, assigneeId: author.id, title: "T", description: null, dueDate: null });
    const taskId = task.ok ? task.task.id : "";
    const first = await addCommentFor(await w.as(other.id), { target: { taskId }, body: "Question for @Rita Review" });
    expect(first.ok).toBe(true);
    expect(await addCommentFor(await w.as(other.id), { target: { taskId }, body: "x", assign: { userId: reviewer.id, kind: "READ" } })).toMatchObject({ ok: false });
    const reply = await addCommentFor(await w.as(reviewer.id), { parentId: first.ok ? first.id : "", body: "Answer" });
    expect(reply.ok).toBe(true);
    const saved = await prisma.comment.findUniqueOrThrow({ where: { id: reply.ok ? reply.id : "" } });
    expect([saved.taskId, saved.parentId]).toEqual([taskId, first.ok ? first.id : ""]);
    // ตอบคำตอบ = ไปอยู่ใต้ความคิดเห็นแรกของเธรด (ชั้นเดียว)
    const nested = await addCommentFor(await w.as(other.id), { parentId: reply.ok ? reply.id : "", body: "Thanks" });
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: nested.ok ? nested.id : "" } })).parentId).toBe(first.ok ? first.id : "");
  });
});
