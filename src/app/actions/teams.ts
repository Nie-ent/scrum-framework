"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { purgeAttachments } from "@/lib/attachment-store";
import { INVITE_DAYS, joinFromInvite, openInvite } from "@/lib/invites";
import { notify } from "@/lib/notify";
import { getTeamControl } from "@/lib/teams";
import { hashToken, inDays, newToken } from "@/lib/tokens";
import type { FormState } from "./auth";

const teamName = z.string().trim().min(1, { error: "กรุณาระบุชื่อทีม" }).max(60, { error: "ชื่อทีมยาวเกิน 60 ตัวอักษร" });
const title = z
  .string()
  .trim()
  .max(40, { error: "ชื่อบทบาทยาวเกิน 40 ตัวอักษร" })
  .transform((v) => v || null);

function done(teamId?: string) {
  revalidatePath("/teams");
  if (teamId) revalidatePath(`/teams/${teamId}`);
  revalidatePath("/", "layout");
}

/** สร้างทีมใหม่ (ทีมระดับบน) — คนสร้างเป็นเจ้าของทีม */
export async function createTeam(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = z.object({ name: teamName, title }).safeParse({ name: formData.get("name") ?? "", title: formData.get("title") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const team = await prisma.team.create({
    data: {
      name: parsed.data.name,
      members: { create: { userId: user.id, access: "OWNER", isLead: true, title: parsed.data.title } },
    },
  });
  done();
  redirect(`/teams/${team.id}`);
}

/** สร้างทีมย่อยใต้ทีมระดับบน — เฉพาะเจ้าของทีม */
export async function createSubTeam(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parentId = String(formData.get("teamId") ?? "");
  const parsed = teamName.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const control = await getTeamControl(user, parentId);
  if (!control?.owner) return { error: "เฉพาะเจ้าของทีมสร้างทีมย่อยได้" };
  if (control.team.parentId) return { error: "สร้างทีมย่อยได้เฉพาะใต้ทีมระดับบน (ซ้อนได้ 2 ชั้น)" };
  try {
    await prisma.team.create({ data: { name: parsed.data, parentId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "มีทีมย่อยชื่อนี้แล้ว" };
    throw e;
  }
  done(parentId);
  return { ok: "สร้างทีมย่อยแล้ว" };
}

const InviteSchema = z.object({
  teamId: z.string().min(1),
  email: z.email({ error: "อีเมลไม่ถูกต้อง" }).trim().toLowerCase(),
  access: z.enum(["LEAD", "MEMBER"]),
  title,
});

/**
 * เชิญเข้าทีมด้วยอีเมล — หัวหน้าทีมเชิญสมาชิกทั่วไปได้ เจ้าของทีมเชิญเป็นหัวหน้าได้ด้วย
 * คืนลิงก์คำเชิญ (id) ให้คัดลอกส่งเองได้เสมอ และส่งอีเมลให้ด้วยถ้าตั้งค่า Resend ไว้
 */
export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = InviteSchema.safeParse({
    teamId: formData.get("teamId") ?? "",
    email: formData.get("email") ?? "",
    access: formData.get("access") ?? "MEMBER",
    title: formData.get("title") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { teamId, email, access } = parsed.data;
  const control = await getTeamControl(user, teamId);
  if (!control?.lead) return { error: "คุณไม่มีสิทธิ์เชิญคนเข้าทีมนี้" };
  if (access === "LEAD" && !control.owner) return { error: "เฉพาะเจ้าของทีมเชิญเป็นหัวหน้าทีมได้" };

  if (await prisma.teamMember.findFirst({ where: { teamId, user: { email } } })) return { error: "คนนี้อยู่ในทีมอยู่แล้ว" };
  // เชิญซ้ำ = ยกเลิกคำเชิญเดิมที่ค้างอยู่แล้วออกลิงก์ใหม่
  await prisma.invite.updateMany({ where: { teamId, email, ...openInvite() }, data: { revokedAt: new Date() } });

  const { token, tokenHash } = newToken();
  await prisma.invite.create({
    data: { teamId, email, access, title: parsed.data.title, invitedById: user.id, tokenHash, expiresAt: inDays(INVITE_DAYS) },
  });
  const link = appUrl(`/invite/${token}`);
  const emailed = await sendEmail({
    to: email,
    subject: `${user.name} เชิญคุณเข้าทีม ${control.team.name} บน Pace`,
    heading: `คุณได้รับเชิญเข้าทีม ${control.team.name}`,
    body: `${user.name} เชิญคุณเข้าร่วมทีม ${control.team.name} บน Pace\nคำเชิญนี้ใช้ได้ ${INVITE_DAYS} วัน`,
    action: { label: "รับคำเชิญ", url: link },
  });
  // คนที่มีบัญชีอยู่แล้ว: ขึ้นกระดิ่งในแอปให้กดรับได้เลย
  const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true, emailVerifiedAt: true } });
  if (invitee?.emailVerifiedAt) {
    await prisma.notification.create({
      data: { userId: invitee.id, title: `${user.name} เชิญคุณเข้าทีม ${control.team.name}`, body: "กดเพื่อดูและรับคำเชิญ", url: "/teams" },
    });
  }
  done(teamId);
  // id = ลิงก์คำเชิญ แสดงให้คัดลอกครั้งเดียว (ใน database เก็บเฉพาะ hash)
  return { ok: emailed ? `ส่งคำเชิญไปที่ ${email} แล้ว` : "สร้างคำเชิญแล้ว — คัดลอกลิงก์ด้านล่างส่งให้เขา (ถ้าเขามีบัญชีที่ยืนยันอีเมลแล้ว จะเห็นคำเชิญในแอปเลย)", id: link };
}

export async function revokeInvite(formData: FormData) {
  const user = await requireUser();
  const invite = await prisma.invite.findUnique({ where: { id: String(formData.get("id")) } }).catch(() => null);
  if (!invite || invite.acceptedAt) return;
  if (!(await getTeamControl(user, invite.teamId))?.lead) return;
  await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  done(invite.teamId);
}

/** กดรับ/ปฏิเสธคำเชิญในแอป — เฉพาะคำเชิญที่ส่งถึงอีเมลของตัวเอง และต้องยืนยันอีเมลแล้ว */
export async function respondToInvite(formData: FormData) {
  const user = await requireUser();
  if (!user.emailVerifiedAt) return;
  const invite = await prisma.invite
    .findFirst({ where: { id: String(formData.get("id")), email: user.email, ...openInvite() } })
    .catch(() => null);
  if (!invite) return;
  if (formData.get("decline")) await prisma.invite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
  else await joinFromInvite(invite, user.id);
  done(invite.teamId);
}

/** รับคำเชิญจากลิงก์ (token ใช้ได้ครั้งเดียว) */
export async function acceptInviteLink(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const invite = await prisma.invite.findFirst({ where: { tokenHash: hashToken(String(formData.get("token") ?? "")), ...openInvite() } });
  if (!invite) return { error: "คำเชิญนี้ใช้ไม่ได้แล้ว (หมดอายุ ถูกยกเลิก หรือถูกใช้ไปแล้ว)" };
  await joinFromInvite(invite, user.id);
  done(invite.teamId);
  redirect(`/standup?team=${invite.teamId}`);
}

const MemberSchema = z.object({
  teamId: z.string().min(1),
  userId: z.string().min(1),
  access: z.enum(["OWNER", "LEAD", "MEMBER"]),
  title,
  participates: z.boolean(),
});

/** ทีมต้องมีเจ้าของอย่างน้อย 1 คนเสมอ (ทีมเก่าที่ยังไม่มีเจ้าของไม่ถูกบังคับ) */
async function isLastOwner(teamId: string, userId: string) {
  const owners = await prisma.teamMember.findMany({ where: { teamId, access: "OWNER" }, select: { userId: true } });
  return owners.length === 1 && owners[0].userId === userId;
}

/** แก้สิทธิ์ / ชื่อบทบาท / การเช็กอินของสมาชิก — เฉพาะเจ้าของทีม */
export async function updateMember(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = MemberSchema.safeParse({
    teamId: formData.get("teamId") ?? "",
    userId: formData.get("userId") ?? "",
    access: formData.get("access") ?? "",
    title: formData.get("title") ?? "",
    participates: formData.get("participates") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { teamId, userId, ...data } = parsed.data;
  if (!(await getTeamControl(user, teamId))?.owner) return { error: "เฉพาะเจ้าของทีมแก้ไขสมาชิกได้" };
  if (data.access !== "OWNER" && (await isLastOwner(teamId, userId))) return { error: "ทีมต้องมีเจ้าของอย่างน้อย 1 คน — ตั้งคนอื่นเป็นเจ้าของก่อน" };
  const updated = await prisma.teamMember.updateMany({ where: { teamId, userId }, data: { ...data, isLead: data.access !== "MEMBER" } });
  if (updated.count === 0) return { error: "ไม่พบสมาชิกคนนี้" };
  done(teamId);
  return { ok: "บันทึกแล้ว" };
}

/** เอาสมาชิกออกจากทีม (เจ้าของทีม) หรือออกจากทีมเอง — เช็กอินและงานเดิมยังอยู่ */
export async function removeMember(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const self = userId === user.id;
  if (!self && !(await getTeamControl(user, teamId))?.owner) return { error: "เฉพาะเจ้าของทีมเอาสมาชิกออกได้" };
  if (await isLastOwner(teamId, userId)) return { error: "ทีมต้องมีเจ้าของอย่างน้อย 1 คน — ตั้งคนอื่นเป็นเจ้าของก่อน" };
  await prisma.teamMember.deleteMany({ where: { teamId, userId } });
  done(teamId);
  if (self) redirect("/teams");
  return { ok: "เอาออกจากทีมแล้ว" };
}

/**
 * ลบทีมถาวร — เฉพาะเจ้าของทีม และต้องพิมพ์ชื่อทีมยืนยัน
 * ลบสมาชิกภาพ งาน เช็กอิน ความคิดเห็น คำเชิญ และไฟล์แนบของทีมนี้ทั้งหมด (บัญชีผู้ใช้ไม่ถูกลบ)
 */
export async function deleteTeam(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  const control = await getTeamControl(user, teamId);
  if (!control?.owner) return { error: "เฉพาะเจ้าของทีมลบทีมได้" };
  if (String(formData.get("confirm") ?? "").trim() !== control.team.name) return { error: "พิมพ์ชื่อทีมให้ตรงเพื่อยืนยันการลบ" };
  if ((await prisma.team.count({ where: { parentId: teamId } })) > 0) return { error: "ทีมนี้ยังมีทีมย่อย — ลบทีมย่อยก่อน" };

  const members = await prisma.teamMember.findMany({ where: { teamId, userId: { not: user.id } }, select: { userId: true } });
  // ไฟล์ใน Storage ลบก่อน (ถ้า Storage มีปัญหา แถวที่เหลือจะถูก cron เก็บกวาดทีหลัง)
  await purgeAttachments({
    OR: [{ task: { teamId } }, { comment: { task: { teamId } } }, { comment: { standup: { teamId } } }],
  }).catch((e) => console.error(e));
  await prisma.$transaction([
    prisma.standup.deleteMany({ where: { teamId } }),
    prisma.team.delete({ where: { id: teamId } }),
  ]);
  await notify(
    members.map((m) => ({ userId: m.userId })),
    { title: `ทีม ${control.team.name} ถูกลบ`, body: `${user.name} ลบทีมนี้แล้ว`, url: "/teams" },
  );
  done();
  redirect(control.team.parentId ? `/teams/${control.team.parentId}` : "/teams");
}

/** ตั้งลิงก์ห้องประชุมประจำทีม (เว้นว่าง = ลบ) — เฉพาะเจ้าของทีม · รับเฉพาะ https */
export async function setMeetingUrl(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const teamId = String(formData.get("teamId") ?? "");
  if (!(await getTeamControl(user, teamId))?.owner) return { error: "เฉพาะเจ้าของทีมตั้งลิงก์ห้องประชุมได้" };
  const raw = String(formData.get("meetingUrl") ?? "").trim();
  let meetingUrl: string | null = null;
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || raw.length > 500) throw new Error("invalid");
      meetingUrl = url.toString();
    } catch {
      return { error: "ใส่ลิงก์ที่ขึ้นต้นด้วย https:// เช่น https://meet.google.com/abc-defg-hij" };
    }
  }
  await prisma.team.update({ where: { id: teamId }, data: { meetingUrl } });
  done(teamId);
  return { ok: meetingUrl ? "บันทึกลิงก์ห้องประชุมแล้ว" : "ลบลิงก์ห้องประชุมแล้ว" };
}
