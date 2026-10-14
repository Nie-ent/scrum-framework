import "server-only";
import type { Subscription } from "@prisma/client";
import { prisma } from "./db";

/**
 * แพ็กเกจ — คิดต่อ workspace (ทีมระดับบน + ทีมย่อยทั้งหมด) ส่วนพื้นที่ส่วนตัวฟรีเสมอและไม่นับ
 * - ฟรี: ไม่เกิน FREE_SEATS คน
 * - ทีม: ไม่เกินจำนวนที่นั่งที่จ่าย (หรือที่ผู้ดูแลระบบให้)
 * ไม่เคยลบหรือเอาใครออกเอง — เกินโควตา = เพิ่มคนใหม่ไม่ได้จนกว่าจะเพิ่มที่นั่ง
 */
export const FREE_SEATS = 5;

/** สถานะจาก Stripe ที่ยังใช้แพ็กเกจที่จ่ายได้ (past_due = ตัดเงินไม่ผ่าน ยังให้ใช้ระหว่างลองตัดใหม่) */
const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export type PlanState = {
  plan: "FREE" | "TEAM";
  seats: number;
  /** มาจากไหน: ฟรี / จ่ายเงิน / ผู้ดูแลระบบให้ */
  source: "free" | "paid" | "comp";
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  compUntil: Date | null;
  pastDue: boolean;
};

export function planState(sub: Subscription | null, now = new Date()): PlanState {
  const base = { status: sub?.status ?? "none", currentPeriodEnd: sub?.currentPeriodEnd ?? null, cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false, compUntil: sub?.compUntil ?? null, pastDue: sub?.status === "past_due" };
  const paid = sub && sub.plan === "TEAM" && PAID_STATUSES.has(sub.status) ? sub.seats : 0;
  const comp = sub?.compUntil && sub.compUntil > now ? (sub.compSeats ?? 0) : 0;
  if (paid === 0 && comp === 0) return { ...base, plan: "FREE", seats: FREE_SEATS, source: "free" };
  return { ...base, plan: "TEAM", seats: Math.max(paid, comp, FREE_SEATS), source: paid >= comp ? "paid" : "comp" };
}

/** ทีมระดับบนของทีมนี้ (ทีมย่อยใช้แพ็กเกจของทีมแม่) — null = ไม่มีทีม หรือเป็นพื้นที่ส่วนตัว */
export async function workspaceOf(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true, parentId: true, personalOfId: true } });
  if (!team || team.personalOfId) return null;
  return team.parentId ?? team.id;
}

/** คนใน workspace (ไม่นับซ้ำ ไม่นับบัญชีที่ปิดใช้งาน) */
export async function seatUserIds(rootId: string): Promise<Set<string>> {
  const rows = await prisma.teamMember.findMany({
    where: { team: { OR: [{ id: rootId }, { parentId: rootId }] }, user: { active: true } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

export async function workspaceUsage(rootId: string) {
  const [sub, users, pending] = await Promise.all([
    prisma.subscription.findUnique({ where: { teamId: rootId } }),
    seatUserIds(rootId),
    // คำเชิญที่ยังรอรับ ของคนที่ยังไม่อยู่ใน workspace (จองที่นั่งไว้)
    prisma.invite.findMany({
      where: { team: { OR: [{ id: rootId }, { parentId: rootId }] }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { email: true },
    }),
  ]);
  const memberEmails = new Set(
    (await prisma.user.findMany({ where: { id: { in: [...users] } }, select: { email: true } })).map((u) => u.email),
  );
  const pendingEmails = new Set(pending.map((p) => p.email).filter((e) => !memberEmails.has(e)));
  return { state: planState(sub), used: users.size, pending: pendingEmails.size, users };
}

export const SEATS_FULL = "ที่นั่งในแพ็กเกจเต็มแล้ว — เจ้าของทีมเพิ่มที่นั่งได้ที่หน้าจัดการทีม";

/**
 * เพิ่มคนนี้เข้า workspace ได้ไหม
 * - inviteEmail: ตอนส่งคำเชิญ (นับคำเชิญที่รออยู่ด้วย ไม่นับคำเชิญเดิมของอีเมลนี้)
 * - userId: ตอนกดรับคำเชิญ (คนที่อยู่ใน workspace แล้วไม่กินที่นั่งเพิ่ม)
 */
export async function canAddSeat(teamId: string, who: { userId?: string; inviteEmail?: string }): Promise<boolean> {
  const rootId = await workspaceOf(teamId);
  if (!rootId) return true;
  const { state, used, pending, users } = await workspaceUsage(rootId);
  if (who.userId && users.has(who.userId)) return true;
  if (who.inviteEmail) {
    const existing = await prisma.user.findUnique({ where: { email: who.inviteEmail }, select: { id: true } });
    if (existing && users.has(existing.id)) return true;
    const already = await prisma.invite.count({
      where: { email: who.inviteEmail, team: { OR: [{ id: rootId }, { parentId: rootId }] }, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return used + pending - (already > 0 ? 1 : 0) < state.seats;
  }
  return used < state.seats;
}
