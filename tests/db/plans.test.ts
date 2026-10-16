import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Subscription } from "@prisma/client";
import { DB_TESTS } from "./setup";
import { makeWorld } from "./fixtures";
import { prisma } from "@/lib/db";
import { canAddSeat, planState, workspaceUsage } from "@/lib/plans";
import { saveSettings } from "@/lib/settings";

const FREE_SEATS = 5;

const sub = (over: Partial<Subscription>): Subscription => ({
  teamId: "t", plan: "TEAM", seats: 0, status: "none", stripeCustomerId: null, stripeSubscriptionId: null,
  currentPeriodEnd: null, cancelAtPeriodEnd: false, compUntil: null, compSeats: null, createdAt: new Date(), updatedAt: new Date(), ...over,
});

describe("planState", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  it("is free without a live subscription", () => {
    expect(planState(null, FREE_SEATS, now)).toMatchObject({ plan: "FREE", seats: FREE_SEATS, source: "free" });
    expect(planState(sub({ seats: 20, status: "canceled" }), FREE_SEATS, now)).toMatchObject({ plan: "FREE", seats: FREE_SEATS });
    expect(planState(sub({ seats: 20, status: "incomplete" }), FREE_SEATS, now).plan).toBe("FREE");
  });
  it("uses paid seats while active or retrying a failed payment", () => {
    expect(planState(sub({ seats: 12, status: "active" }), FREE_SEATS, now)).toMatchObject({ plan: "TEAM", seats: 12, source: "paid" });
    expect(planState(sub({ seats: 12, status: "past_due" }), FREE_SEATS, now)).toMatchObject({ seats: 12, pastDue: true });
  });
  it("never drops below the free allowance, and honours admin grants until they expire", () => {
    expect(planState(sub({ seats: 2, status: "active" }), FREE_SEATS, now).seats).toBe(FREE_SEATS);
    const comp = sub({ plan: "FREE", compSeats: 30, compUntil: new Date("2026-12-31T00:00:00Z") });
    expect(planState(comp, FREE_SEATS, now)).toMatchObject({ plan: "TEAM", seats: 30, source: "comp" });
    expect(planState(comp, FREE_SEATS, new Date("2027-01-01T00:00:00Z")).plan).toBe("FREE");
  });
});

describe.skipIf(!DB_TESTS)("seat limits", () => {
  let w: Awaited<ReturnType<typeof makeWorld>>;
  let root: { id: string }, child: { id: string };
  const people: { id: string; email: string }[] = [];

  beforeAll(async () => {
    w = await makeWorld();
    for (let i = 0; i < 6; i++) people.push(await w.user(`Seat ${i}`));
    // 4 คนในทีมแม่ + 1 คนที่อยู่ทั้งทีมแม่และทีมย่อย (นับครั้งเดียว) = 4 ที่นั่ง
    root = await w.team("Root", people.slice(0, 4).map((p) => [p, "MEMBER"] as [{ id: string }, "MEMBER"]));
    child = await w.team("Child", [[people[0], "MEMBER"]], root.id);
  });
  afterAll(async () => {
    await prisma.invite.deleteMany({ where: { teamId: { in: [root?.id, child?.id].filter(Boolean) } } });
    await w?.cleanup();
  });

  it("counts people once across sub-teams and reserves seats for pending invites", async () => {
    expect((await workspaceUsage(root.id)).used).toBe(4);
    expect(await canAddSeat(child.id, { inviteEmail: people[4].email })).toBe(true);
    await prisma.invite.create({ data: { teamId: child.id, email: people[4].email, tokenHash: `h-${w.tag}`, expiresAt: new Date(Date.now() + 86400000) } });
    // ที่นั่งที่ 5 ถูกจองแล้ว: คนใหม่เชิญไม่ได้ · เชิญคนเดิมซ้ำได้ · คนที่อยู่แล้วเชิญเข้าทีมย่อยได้
    expect(await canAddSeat(root.id, { inviteEmail: people[5].email })).toBe(false);
    expect(await canAddSeat(root.id, { inviteEmail: people[4].email })).toBe(true);
    expect(await canAddSeat(child.id, { inviteEmail: people[1].email })).toBe(true);
    // รับคำเชิญ: ยังมีที่ว่าง 1 ที่
    expect(await canAddSeat(child.id, { userId: people[4].id })).toBe(true);
    await prisma.teamMember.create({ data: { teamId: child.id, userId: people[4].id } });
    expect(await canAddSeat(root.id, { userId: people[5].id })).toBe(false);
    expect(await canAddSeat(root.id, { userId: people[2].id })).toBe(true);
  });

  it("opens seats when the workspace pays, and ignores personal spaces", async () => {
    await prisma.subscription.create({ data: { teamId: root.id, plan: "TEAM", seats: 10, status: "active" } });
    expect(await canAddSeat(root.id, { userId: people[5].id })).toBe(true);
    const personal = await prisma.team.create({ data: { name: `p ${w.tag}`, personalOfId: people[5].id } });
    expect(await canAddSeat(personal.id, { userId: people[0].id })).toBe(true);
    await prisma.team.delete({ where: { id: personal.id } });
  });

  it("follows the free allowance the admin sets, without a deploy", async () => {
    await prisma.subscription.delete({ where: { teamId: root.id } });
    // ตอนนี้ 5 คน เต็มโควตาฟรี 5
    expect(await canAddSeat(root.id, { userId: people[5].id })).toBe(false);
    try {
      await saveSettings({ freeSeats: 8 });
      expect((await workspaceUsage(root.id)).state.seats).toBe(8);
      expect(await canAddSeat(root.id, { userId: people[5].id })).toBe(true);
    } finally {
      await prisma.appSetting.deleteMany({ where: { key: "freeSeats" } });
    }
    expect((await workspaceUsage(root.id)).state.seats).toBe(FREE_SEATS);
  });
});
