import { describe, expect, it } from "vitest";
import { findMentions } from "./mentions";
import { locateAnchor, makeAnchor } from "./anchor";
import { createsCycle, parentProblem } from "./task-graph";
import { extractRefs, segmentRefs } from "./ref-parse";

const people = [
  { id: "u1", name: "ก้อง สุขใจ" },
  { id: "u2", name: "ก้อง" },
  { id: "u3", name: "Ann" },
  { id: "u4", name: "Anna Lee" },
];

describe("findMentions", () => {
  it("picks the longest matching name, including names with spaces", () => {
    expect(findMentions("ฝาก @ก้อง สุขใจ ดูหน่อย", people).map((m) => m.userId)).toEqual(["u1"]);
    expect(findMentions("ฝาก @ก้อง ดูหน่อย", people).map((m) => m.userId)).toEqual(["u2"]);
  });
  it("allows Thai text right after a name (no spaces in Thai)", () => {
    expect(findMentions("@ก้องช่วยตรวจ", people).map((m) => m.userId)).toEqual(["u2"]);
  });
  it("does not treat a longer Latin word as the name", () => {
    expect(findMentions("@Annabel hi", people)).toEqual([]);
    expect(findMentions("@Anna Lee and @Ann.", people).map((m) => m.userId)).toEqual(["u4", "u3"]);
  });
  it("ignores email addresses and is case-insensitive", () => {
    expect(findMentions("mail ann@example.com", people)).toEqual([]);
    expect(findMentions("@ann please", people).map((m) => [m.userId, m.start, m.end])).toEqual([["u3", 0, 4]]);
  });
});

describe("anchors", () => {
  const text = "สรุปประชุม: ต้องส่งงานวันศุกร์ และต้องส่งงานวันจันทร์อีกชุด";
  it("finds the same spot again", () => {
    const start = text.indexOf("ต้องส่งงานวันจันทร์");
    const anchor = makeAnchor(text, start, start + "ต้องส่งงาน".length)!;
    expect(locateAnchor(text, anchor)).toEqual({ start, end: start + "ต้องส่งงาน".length });
  });
  it("prefers the occurrence whose surroundings match when the text repeats", () => {
    const second = text.lastIndexOf("ต้องส่งงาน");
    const anchor = makeAnchor(text, second, second + 10)!;
    const edited = `บรรทัดใหม่ข้างบน\n${text}`;
    expect(locateAnchor(edited, anchor)?.start).toBe(edited.lastIndexOf("ต้องส่งงาน"));
  });
  it("returns null once the quoted text is gone", () => {
    const anchor = makeAnchor(text, 0, 10)!;
    expect(locateAnchor("เนื้อหาใหม่ทั้งหมด", anchor)).toBeNull();
  });
  it("rejects blank selections", () => {
    expect(makeAnchor("a   b", 1, 4)).toBeNull();
  });
});

describe("task graph", () => {
  it("detects direct and indirect cycles", () => {
    const edges: [string, string][] = [["b", "a"], ["c", "b"]]; // b waits a, c waits b
    expect(createsCycle(edges, "a", "c")).toBe(true); // a waits c → c→b→a
    expect(createsCycle(edges, "a", "b")).toBe(true);
    expect(createsCycle(edges, "c", "a")).toBe(false);
    expect(createsCycle(edges, "x", "x")).toBe(true);
  });
  it("allows only one level of subtasks", () => {
    const task = { id: "t", teamId: "A", hasSubtasks: false };
    expect(parentProblem(task, { id: "p", teamId: "A", parentId: null })).toBeNull();
    expect(parentProblem(task, { id: "p", teamId: "A", parentId: "q" })).toBe("งานย่อยมีงานย่อยซ้อนอีกชั้นไม่ได้");
    expect(parentProblem({ ...task, hasSubtasks: true }, { id: "p", teamId: "A", parentId: null })).not.toBeNull();
    expect(parentProblem(task, { id: "p", teamId: "B", parentId: null })).toBe("งานแม่ต้องอยู่ในทีมเดียวกัน");
    expect(parentProblem(task, { id: "t", teamId: "A", parentId: null })).not.toBeNull();
  });
});

describe("references", () => {
  it("extracts tasks, notes and people from plain text", () => {
    expect(extractRefs("ดู #12 กับ [[แผนงาน]] แล้วบอก @Ann ด้วย (#5)", people)).toEqual({ taskNumbers: [12, 5], noteTargets: ["แผนงาน"], userIds: ["u3"] });
  });
  it("splits text into chips, leaving unknown references as text", () => {
    const segments = segmentRefs("ดู #12 #99 [[แผน]] [[ไม่มี]] @Ann https://x.dev/a#3.", {
      people,
      taskNumbers: new Set([12]),
      noteKnown: (t) => t === "แผน",
    });
    expect(segments.filter((s) => s.kind !== "text").map((s) => [s.kind, s.text])).toEqual([
      ["task", "#12"],
      ["note", "แผน"],
      ["mention", "@Ann"],
      ["url", "https://x.dev/a#3"],
    ]);
    expect(segments.map((s) => s.text).join("")).not.toContain("[[แผน]]");
  });
});

describe("reference autocomplete trigger", async () => {
  const { detect } = await import("@/components/ref-textarea");
  it("uses the trigger nearest the cursor", () => {
    const text = "ช่วยดู @สมหญิง เรื่อง #12";
    expect(detect(text, text.length)).toMatchObject({ kind: "task", query: "12" });
    expect(detect("ถาม @ก้อง ส", 11)).toMatchObject({ kind: "person", query: "ก้อง ส" });
    expect(detect("ดู [[แผน", 8)).toMatchObject({ kind: "note", query: "แผน" });
    expect(detect("mail a@b", 8)).toBeNull();
  });
});
