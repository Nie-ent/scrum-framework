import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_TESTS } from "./setup";
import { makeWorld } from "./fixtures";
import { prisma } from "@/lib/db";
import { TOOLS, ToolError } from "@/lib/mcp";

describe.skipIf(!DB_TESTS)("MCP tools", () => {
  let w: Awaited<ReturnType<typeof makeWorld>>;
  let lead: { id: string; email: string }, dev: { id: string; email: string };
  let team: { id: string };

  const call = async (who: { id: string }, name: string, args: Record<string, unknown>) => {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) throw new Error(`no tool ${name}`);
    return tool.run(args, { user: await w.as(who.id), appUrl: "https://pace.test" }) as Promise<Record<string, unknown>>;
  };

  beforeAll(async () => {
    w = await makeWorld();
    lead = await w.user("Lead");
    dev = await w.user("Dev");
    team = await w.team("Asset", [[lead, "LEAD"], [dev, "MEMBER"]]);
  });
  afterAll(async () => w?.cleanup());

  it("lists members with emails and roles", async () => {
    const out = await call(lead, "list_members", { space: team.id });
    expect(out.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Dev", email: dev.email, access: "member", can_be_assigned: true }),
        expect.objectContaining({ name: "Lead", access: "lead", you: true }),
      ]),
    );
  });

  it("creates a parent with labelled subtasks in one batch, then edits structure", async () => {
    const parent = await call(lead, "create_task", { space: team.id, title: "Asset WS", labels: ["Asset WS"] });
    const batch = await call(lead, "create_tasks", {
      space: team.id,
      tasks: [
        { title: "Model", assignee_email: dev.email, parent_number: parent.number, labels: ["Asset WS", "3D"] },
        { title: "Texture", assignee_email: dev.email, parent_number: parent.number },
      ],
    });
    const [model, texture] = batch.tasks as { number: number }[];
    await call(lead, "update_task", { space: team.id, number: texture.number, add_waiting_on: [model.number] });

    const got = await call(lead, "get_task", { space: team.id, number: parent.number });
    expect(got.subtasks).toHaveLength(2);
    const tex = await call(dev, "get_task", { space: team.id, number: texture.number });
    expect(tex).toMatchObject({ parent_number: parent.number, waiting_on: [model.number] });
    const list = await call(dev, "list_tasks", { space: team.id, label: "3d" });
    expect((list.tasks as { title: string }[]).map((t) => t.title)).toEqual(["Model"]);
    expect((await call(dev, "list_labels", { space: team.id })).labels).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Asset WS", tasks: 2 }), expect.objectContaining({ name: "3D", tasks: 1 })]),
    );

    // วนไม่ได้ · ย้ายงานย่อยไปซ้อนอีกชั้นไม่ได้
    await expect(call(lead, "update_task", { space: team.id, number: model.number, add_waiting_on: [texture.number] })).rejects.toBeInstanceOf(ToolError);
    await expect(call(lead, "update_task", { space: team.id, number: parent.number, parent_number: model.number })).rejects.toBeInstanceOf(ToolError);
    // งานแม่ไม่มี = ไม่สร้างทั้งชุด
    const before = await prisma.task.count({ where: { teamId: team.id } });
    await expect(call(lead, "create_tasks", { space: team.id, tasks: [{ title: "x" }, { title: "y", parent_number: 9999 }] })).rejects.toBeInstanceOf(ToolError);
    expect(await prisma.task.count({ where: { teamId: team.id } })).toBe(before);
  });

  it("comments on a note with a quote, asks for review and shows it as waiting", async () => {
    const note = await call(lead, "create_note", { space: team.id, title: "Brief", content: "Deliver the model by Friday." });
    await expect(call(lead, "comment_on_note", { id: note.id, text: "x", quote: "not in the note" })).rejects.toBeInstanceOf(ToolError);
    const made = await call(lead, "comment_on_note", { id: note.id, text: "Check the date @Dev", quote: "by Friday", assignee_email: dev.email, ask: "review" });

    const box = await call(dev, "waiting_on_me", {});
    expect(box.requests).toEqual([expect.objectContaining({ thread_id: made.id, note: "Brief", asks_to: "review", from: "Lead", quote: "by Friday" })]);

    await call(dev, "resolve_note_comment", { id: made.id, action: "approve" });
    const threads = await call(lead, "list_note_comments", { id: note.id, include_resolved: true });
    expect(threads.threads).toEqual([expect.objectContaining({ resolved: true, approved: true, quote: "by Friday" })]);
    expect((await call(dev, "waiting_on_me", {})).requests).toEqual([]);
  });

  it("creates nested folders from a path", async () => {
    const first = await call(dev, "create_folder", { space: team.id, path: "A/B/C" });
    const again = await call(dev, "create_folder", { space: team.id, path: "A/B/D" });
    expect(first.created_folders).toEqual(["A", "B", "C"]);
    expect(again.created_folders).toEqual(["D"]);
  });
});
