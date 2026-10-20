import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB_TESTS } from "./setup";
import { makeWorld } from "./fixtures";
import { prisma } from "@/lib/db";
import { noteImageIds, purgeUnusedNoteImages } from "@/lib/attachment-store";

describe("noteImageIds", () => {
  it("finds image ids in relative and absolute links, ignoring the size suffix", () => {
    const ids = noteImageIds("![a](/api/files/abc123#s) and ![b](https://www.pacescrum.com/api/files/def456)");
    expect([...ids]).toEqual(["abc123", "def456"]);
  });
});

describe.skipIf(!DB_TESTS)("note images", () => {
  let w: Awaited<ReturnType<typeof makeWorld>>;
  let noteId: string;
  let uploaderId: string;

  beforeAll(async () => {
    w = await makeWorld();
    const u = await w.user("Writer");
    uploaderId = u.id;
    const team = await w.team("Images", [[u, "MEMBER"]]);
    noteId = (await prisma.note.create({ data: { teamId: team.id, title: "Pics", createdById: u.id } })).id;
  });
  afterAll(() => w.cleanup());

  const image = (createdAt: Date) =>
    prisma.attachment.create({
      data: { uploaderId, noteId, name: "shot.png", mimeType: "image/png", size: 10, path: crypto.randomUUID(), uploadedAt: createdAt, createdAt, expiresAt: createdAt },
    });

  it("keeps images the note still shows, and recent ones that may come back with undo", async () => {
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const used = await image(old);
    const removed = await image(old);
    const fresh = await image(new Date());
    await prisma.note.update({ where: { id: noteId }, data: { content: `Look ![shot](/api/files/${used.id}#m)` } });

    expect(await purgeUnusedNoteImages(new Date(Date.now() - 24 * 60 * 60 * 1000))).toBe(1);
    const left = await prisma.attachment.findMany({ where: { noteId }, select: { id: true } });
    expect(left.map((r) => r.id).sort()).toEqual([used.id, fresh.id].sort());
    expect(left.some((r) => r.id === removed.id)).toBe(false);
  });
});
