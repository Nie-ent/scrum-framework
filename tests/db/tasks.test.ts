import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_TESTS } from "./setup";
import { makeWorld } from "./fixtures";
import { prisma } from "@/lib/db";
import { editCommentFor } from "@/lib/comment-ops";
import { createGroupTaskFor, createTaskFor, createTasksFor, editTaskFor, setDueFor, setProgressFor } from "@/lib/task-ops";
import { addBlockerFor, availableLabels, createLabelFor, removeBlockerFor, setLabelsFor, setParentFor, updateLabelFor } from "@/lib/task-structure";
import { keyToDate } from "@/lib/dates";

describe.skipIf(!DB_TESTS)("tasks: edit, reassign, bulk, subtasks, labels, waiting-on", () => {
  let w: Awaited<ReturnType<typeof makeWorld>>;
  let lead: { id: string }, dev1: { id: string }, dev2: { id: string }, outsider: { id: string };
  let parentTeam: { id: string }, team: { id: string };

  beforeAll(async () => {
    w = await makeWorld();
    lead = await w.user("Lead");
    dev1 = await w.user("Dev One");
    dev2 = await w.user("Dev Two");
    outsider = await w.user("Outsider");
    parentTeam = await w.team("Parent", [[lead, "LEAD"]]);
    team = await w.team("Web", [[dev1, "MEMBER"], [dev2, "MEMBER"]], parentTeam.id);
    await w.team("Other", [[outsider, "MEMBER"]]);
  });
  afterAll(async () => w?.cleanup());

  const make = async (by: { id: string }, assignee: { id: string }, title: string, extra: { description?: string; parentId?: string; due?: string } = {}) => {
    const result = await createTaskFor(await w.as(by.id), {
      teamId: team.id,
      assigneeId: assignee.id,
      title,
      description: extra.description ?? null,
      dueDate: extra.due ? keyToDate(extra.due) : null,
      parentId: extra.parentId,
    });
    if (!result.ok) throw new Error(result.error);
    return prisma.task.findUniqueOrThrow({ where: { id: result.task.id } });
  };

  it("edits text; only leads or the assigner reassign", async () => {
    const t = await make(lead, dev1, "Write report");
    expect(await editTaskFor(await w.as(dev1.id), t.id, { title: "Write the report", description: "two\nlines" })).toEqual({ ok: true });
    expect(await editTaskFor(await w.as(dev2.id), t.id, { title: "x" })).toMatchObject({ ok: false });
    expect(await editTaskFor(await w.as(dev1.id), t.id, { assigneeId: dev2.id })).toMatchObject({ ok: false });
    expect(await editTaskFor(await w.as(lead.id), t.id, { assigneeId: outsider.id })).toMatchObject({ ok: false, error: "ผู้รับงานไม่ได้อยู่ในทีมนี้" });
    expect(await editTaskFor(await w.as(lead.id), t.id, { assigneeId: dev2.id })).toEqual({ ok: true });
    const after = await prisma.task.findUniqueOrThrow({ where: { id: t.id }, include: { comments: true } });
    expect([after.title, after.description, after.assigneeId]).toEqual(["Write the report", "two\nlines", dev2.id]);
    expect(after.comments.map((c) => c.body)).toEqual(["โอนงานจาก Dev One ให้ Dev Two"]);
    expect((await w.notices(dev1.id)).at(-1)?.title).toContain("โอนงานของคุณให้ Dev Two");

    // สมาชิกที่สร้างงานให้ตัวเอง โอนไม่ได้
    const own = await make(dev1, dev1, "Mine");
    expect(await editTaskFor(await w.as(dev1.id), own.id, { assigneeId: dev2.id })).toMatchObject({ ok: false });
  });

  it("creates a batch all-or-nothing", async () => {
    const before = await prisma.task.count({ where: { teamId: team.id } });
    const bad = await createTasksFor(await w.as(dev1.id), team.id, [
      { assigneeId: dev1.id, title: "a", description: null, dueDate: null },
      { assigneeId: dev2.id, title: "b", description: null, dueDate: null },
    ]);
    expect(bad).toMatchObject({ ok: false });
    expect(await prisma.task.count({ where: { teamId: team.id } })).toBe(before);
    const good = await createTasksFor(await w.as(lead.id), team.id, [
      { assigneeId: dev1.id, title: "a", description: null, dueDate: null },
      { assigneeId: dev1.id, title: "b", description: null, dueDate: null },
    ]);
    expect(good.ok && good.tasks.length).toBe(2);
    expect((await w.notices(dev1.id)).at(-1)?.title).toContain("งานใหม่ 2 งานจาก Lead");
  });

  it("keeps subtasks to one level", async () => {
    const parent = await make(lead, dev1, "Epic");
    const child = await make(lead, dev1, "Part 1", { parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    const other = await make(lead, dev2, "Other");
    expect(await setParentFor(await w.as(lead.id), other.id, child.id)).toMatchObject({ ok: false, error: "งานย่อยมีงานย่อยซ้อนอีกชั้นไม่ได้" });
    expect(await setParentFor(await w.as(lead.id), parent.id, other.id)).toMatchObject({ ok: false });
    expect(await setParentFor(await w.as(lead.id), other.id, parent.id)).toEqual({ ok: true });
    expect(await setParentFor(await w.as(lead.id), other.id, null)).toEqual({ ok: true });
    // ลบงานแม่ (จริง) แล้วงานย่อยกลายเป็นงานปกติ
    await prisma.task.delete({ where: { id: parent.id } });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBeNull();
  });

  it("shares parent-team labels and limits label admin to leads", async () => {
    const parentLabel = await createLabelFor(await w.as(lead.id), parentTeam.id, "  Asset   WS ", "amber");
    expect(parentLabel.ok && parentLabel.label.name).toBe("Asset WS");
    const own = await createLabelFor(await w.as(dev1.id), team.id, "Bug", "rose");
    const dup = await createLabelFor(await w.as(dev2.id), team.id, "asset ws");
    expect(dup.ok && parentLabel.ok && dup.label.id).toBe(parentLabel.ok && parentLabel.label.id);
    expect(await createLabelFor(await w.as(outsider.id), team.id, "Nope")).toMatchObject({ ok: false });
    expect((await availableLabels(team.id)).map((l) => l.name)).toEqual(["Bug", "Asset WS"]);

    const t = await make(lead, dev1, "Labelled");
    const ids = [own.ok ? own.label.id : "", parentLabel.ok ? parentLabel.label.id : ""];
    expect(await setLabelsFor(await w.as(dev1.id), t.id, ids)).toEqual({ ok: true });
    expect(await prisma.taskLabel.count({ where: { taskId: t.id } })).toBe(2);
    expect(await updateLabelFor(await w.as(dev1.id), ids[0], { name: "Defect" })).toMatchObject({ ok: false });
    expect(await updateLabelFor(await w.as(lead.id), ids[0], { name: "Defect", color: "sky" })).toEqual({ ok: true });
    expect(await prisma.label.findUniqueOrThrow({ where: { id: ids[0] } })).toMatchObject({ name: "Defect", color: "sky" });
    expect(await updateLabelFor(await w.as(lead.id), ids[0], { name: "asset ws" })).toMatchObject({ ok: false, error: "มีป้ายชื่อนี้อยู่แล้ว" });
    // ทีมแม่สร้างชื่อที่ทีมย่อยใช้อยู่ไม่ได้
    expect(await createLabelFor(await w.as(lead.id), parentTeam.id, "defect")).toMatchObject({ ok: false, error: "มีป้ายชื่อนี้อยู่แล้วในทีมย่อย" });
    expect(await updateLabelFor(await w.as(lead.id), ids[0], "delete")).toEqual({ ok: true });
    expect(await prisma.taskLabel.count({ where: { taskId: t.id } })).toBe(1);
  });

  it("tracks waiting-on, refuses cycles and alerts on slips and unblocking", async () => {
    const a = await make(lead, dev1, "Design", { due: "2030-01-10" });
    const b = await make(lead, dev2, "Build", { due: "2030-01-12" });
    const c = await make(lead, dev2, "Ship", { due: "2030-01-20" });
    expect(await addBlockerFor(await w.as(lead.id), b.id, a.id)).toEqual({ ok: true });
    expect(await addBlockerFor(await w.as(lead.id), c.id, b.id)).toEqual({ ok: true });
    expect(await addBlockerFor(await w.as(lead.id), a.id, c.id)).toMatchObject({ ok: false, error: "ตั้งไม่ได้ เพราะงานจะรอกันเป็นวง" });

    // เลื่อน Design ไปหลังกำหนดส่งของ Build → คนทำ Build ได้เตือน
    expect(await setDueFor(await w.as(dev1.id), a.id, "2030-01-15", "รอข้อมูลลูกค้า")).toEqual({ ok: true });
    expect((await w.notices(dev2.id)).at(-1)?.title).toContain("งานที่คุณรออยู่ถูกเลื่อน");

    // Design เสร็จ → Build เริ่มได้ · Ship ยังรอ Build อยู่ จึงยังไม่แจ้ง
    const before = (await w.notices(dev2.id)).length;
    expect(await setProgressFor(await w.as(dev1.id), a.id, 100, "")).toEqual({ ok: true });
    const fresh = (await w.notices(dev2.id)).slice(before);
    expect(fresh.map((n) => n.title)).toEqual([expect.stringContaining(`เริ่ม #${b.number} Build ได้แล้ว`)]);
    expect(await removeBlockerFor(await w.as(lead.id), c.id, b.id)).toEqual({ ok: true });
  });

  it("records references and notifies people tagged in a description", async () => {
    const target = await make(lead, dev1, "Target");
    const t = await make(lead, dev1, "Refers", { description: `หลัง #${target.number} ฝาก @Dev Two ช่วยดู` });
    const refs = await prisma.ref.findMany({ where: { fromTaskId: t.id } });
    expect(refs.map((r) => r.toTaskId ?? r.toUserId).sort()).toEqual([target.id, dev2.id].sort());
    expect((await w.notices(dev2.id)).at(-1)?.title).toContain("Lead กล่าวถึงคุณในงาน");
    // แก้รายละเอียดโดยยังแท็กคนเดิม = ไม่แจ้งซ้ำ
    const count = (await w.notices(dev2.id)).length;
    await editTaskFor(await w.as(lead.id), t.id, { description: `ฝาก @Dev Two อีกที` });
    expect((await w.notices(dev2.id)).length).toBe(count);
    expect(await prisma.ref.count({ where: { fromTaskId: t.id } })).toBe(1);
  });

  it("gives one task to several people: parent + a subtask each, parent closes when all are done", async () => {
    const as = await w.as(lead.id);
    // สมาชิกทั่วไปมอบให้หลายคนไม่ได้ · คนนอกทีมไม่ได้
    expect((await createGroupTaskFor(await w.as(dev1.id), { teamId: team.id, assigneeIds: [dev1.id, dev2.id], title: "x", description: null, dueDate: null })).ok).toBe(false);
    expect((await createGroupTaskFor(as, { teamId: team.id, assigneeIds: [dev1.id, outsider.id], title: "x", description: null, dueDate: null })).ok).toBe(false);

    const result = await createGroupTaskFor(as, { teamId: team.id, assigneeIds: [dev1.id, dev2.id, dev1.id], title: "Q4 report", description: "อ่านก่อน", dueDate: keyToDate("2026-12-01") });
    if (!result.ok) throw new Error(result.error);
    expect(result.subtasks).toHaveLength(2);
    const parent = await prisma.task.findUniqueOrThrow({ where: { id: result.task.id } });
    // หัวหน้าทีมแม่ไม่ได้อยู่ในทีมนี้ → งานแม่เป็นของคนแรกที่ถูกแท็ก
    expect(parent.assigneeId).toBe(dev1.id);
    const kids = await prisma.task.findMany({ where: { parentId: parent.id }, orderBy: { number: "asc" } });
    expect(kids.map((k) => k.assigneeId)).toEqual([dev1.id, dev2.id]);
    expect(kids.every((k) => k.title === "Q4 report" && k.dueDate?.getTime() === parent.dueDate?.getTime())).toBe(true);

    expect((await setProgressFor(await w.as(dev1.id), kids[0].id, 100, "")).ok).toBe(true);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: parent.id } })).progress).toBe(0);
    expect((await setProgressFor(await w.as(dev2.id), kids[1].id, 100, "")).ok).toBe(true);
    const closed = await prisma.task.findUniqueOrThrow({ where: { id: parent.id } });
    expect(closed.progress).toBe(100);
    expect(closed.doneAt).not.toBeNull();
  });

  it("needs a reason to push a due date later, records every change and lets the author fix the reason", async () => {
    const t = await make(lead, dev1, "Slides", { due: "2030-02-10" });
    const as = await w.as(dev1.id);
    // เลื่อนออกไป / เอาออก ไม่มีเหตุผล = ไม่ได้
    expect(await setDueFor(as, t.id, "2030-02-20")).toEqual({ ok: false, error: "เลื่อนกำหนดส่งต้องใส่เหตุผล" });
    expect(await setDueFor(as, t.id, "", "  ")).toEqual({ ok: false, error: "เลื่อนกำหนดส่งต้องใส่เหตุผล" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).dueDate?.toISOString().slice(0, 10)).toBe("2030-02-10");
    // ย้อนไปก่อนวันนี้ไม่ได้ ทั้งตอนเลื่อนและตอนสร้างงาน
    expect(await setDueFor(as, t.id, "2020-01-01", "x")).toEqual({ ok: false, error: "กำหนดส่งต้องเป็นวันนี้หรือหลังจากนี้" });
    expect(await createTaskFor(as, { teamId: team.id, assigneeId: dev1.id, title: "Old", description: null, dueDate: keyToDate("2020-01-01") })).toMatchObject({ ok: false });
    // เลื่อนเข้ามาเร็วขึ้นไม่ต้องมีเหตุผล
    expect(await setDueFor(as, t.id, "2030-02-05")).toEqual({ ok: true });
    const before = (await w.notices(lead.id)).length;
    expect(await setDueFor(as, t.id, "2030-02-25", "รอรีวิวจากลูกค้า")).toEqual({ ok: true });
    // คนมอบหมายได้แจ้งพร้อมเหตุผล
    expect((await w.notices(lead.id)).slice(before).map((n) => n.body)).toEqual([expect.stringContaining("รอรีวิวจากลูกค้า")]);

    const log = await prisma.comment.findMany({ where: { taskId: t.id, dueChange: true }, orderBy: { createdAt: "asc" } });
    expect(log.map((c) => [c.dueFrom?.toISOString().slice(0, 10), c.dueTo?.toISOString().slice(0, 10), c.body])).toEqual([
      ["2030-02-10", "2030-02-05", ""],
      ["2030-02-05", "2030-02-25", "รอรีวิวจากลูกค้า"],
    ]);
    // แก้เหตุผลได้ แต่ลบเหตุผลของการเลื่อนออกไม่ได้ · คนอื่นแก้ไม่ได้
    expect(await editCommentFor(as, log[1].id, "รอรีวิวจากลูกค้า (เลื่อนประชุม)")).toEqual({ ok: true });
    expect(await editCommentFor(as, log[1].id, "")).toMatchObject({ ok: false });
    expect(await editCommentFor(await w.as(lead.id), log[1].id, "x")).toMatchObject({ ok: false });
    const fixed = await prisma.comment.findUniqueOrThrow({ where: { id: log[1].id } });
    expect(fixed.body).toBe("รอรีวิวจากลูกค้า (เลื่อนประชุม)");
    expect(fixed.editedAt).not.toBeNull();
    // รายการอัปเดต % ก็แก้เหตุผลได้
    await setProgressFor(as, t.id, 40, "");
    const progress = await prisma.comment.findFirstOrThrow({ where: { taskId: t.id, progressTo: 40 } });
    expect(await editCommentFor(as, progress.id, "ทำสไลด์ครึ่งแรกแล้ว")).toEqual({ ok: true });
  });
});
