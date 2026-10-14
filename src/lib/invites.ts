import "server-only";
import type { Invite } from "@prisma/client";
import { prisma } from "./db";

/** คำเชิญที่ยังรับได้ */
export const openInvite = () => ({ acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } });

export const INVITE_DAYS = 7;

/** ปลายทางหลัง login/สมัคร: เฉพาะหน้าคำเชิญ หรือหน้ายินยอม OAuth ของเราเอง (กัน open redirect) */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  return /^\/invite\/[A-Za-z0-9_-]+$/.test(value) || /^\/oauth\/authorize\?[^#\\]*$/.test(value) ? value : "/";
}

/** ใครก็สมัครเองได้ — ตั้ง ALLOW_SIGNUP=false เพื่อปิด (สมัครได้เฉพาะคนที่มีลิงก์คำเชิญ) */
export const isSignupOpen = () => process.env.ALLOW_SIGNUP !== "false";

/** เข้าทีมตามคำเชิญ — ถ้าอยู่ในทีมอยู่แล้วจะไม่ลดสิทธิ์เดิม */
export async function joinFromInvite(invite: Invite, userId: string) {
  const existing = await prisma.teamMember.findUnique({ where: { userId_teamId: { userId, teamId: invite.teamId } } });
  const lead = invite.access !== "MEMBER";
  await prisma.$transaction([
    existing
      ? prisma.teamMember.update({
          where: { userId_teamId: { userId, teamId: invite.teamId } },
          data: existing.access === "MEMBER" && lead ? { access: invite.access, isLead: true } : {},
        })
      : prisma.teamMember.create({
          data: { userId, teamId: invite.teamId, access: invite.access, isLead: lead, title: invite.title },
        }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date(), acceptedById: userId } }),
  ]);
}
