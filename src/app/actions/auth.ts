"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createSession, deleteSession } from "@/lib/session";
import { appUrl, isEmailConfigured, sendEmail } from "@/lib/email";
import { isSignupOpen, openInvite } from "@/lib/invites";
import { TOO_MANY, clientIp, rateLimit } from "@/lib/rate-limit";
import { hashToken, inHours, newToken } from "@/lib/tokens";

/** id = รายการที่เพิ่งสร้าง (ใช้ต่อ เช่น แนบไฟล์ให้งาน/ความคิดเห็นนั้น) */
export type FormState = { error?: string; ok?: string; id?: string } | undefined;

const LoginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1),
});

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง" };
  // กันเดารหัสผ่าน: จำกัดทั้งต่อบัญชีและต่อ IP ใน 15 นาที
  const ip = await clientIp();
  const allowed = (await rateLimit(`login:acct:${parsed.data.email}`, 10, 900)) && (await rateLimit(`login:ip:${ip}`, 40, 900));
  if (!allowed) return { error: TOO_MANY };

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

  await createSession(user.id, formData.get("remember") === "on");
  redirect(safeNext(formData.get("next")));
}

/** หลัง login/สมัคร กลับไปได้เฉพาะหน้าคำเชิญ (กัน open redirect) */
function safeNext(value: unknown) {
  return typeof value === "string" && /^\/invite\/[A-Za-z0-9_-]+$/.test(value) ? value : "/";
}

const SignupSchema = z.object({
  name: z.string().trim().min(1, { error: "กรุณาระบุชื่อ" }).max(100),
  email: z.email({ error: "อีเมลไม่ถูกต้อง" }).trim().toLowerCase(),
  password: z.string().min(8, { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" }).max(200),
});

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = SignupSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const next = safeNext(formData.get("next"));
  if (!(await rateLimit(`signup:ip:${await clientIp()}`, 5, 3600))) return { error: TOO_MANY };

  // ปิดสมัครเองอยู่ก็ยังสมัครได้ถ้ามาจากลิงก์คำเชิญที่ยังใช้ได้
  if (!isSignupOpen()) {
    const token = next.startsWith("/invite/") ? next.slice("/invite/".length) : "";
    const invited = token && (await prisma.invite.findFirst({ where: { tokenHash: hashToken(token), ...openInvite() } }));
    if (!invited) return { error: "ยังไม่เปิดให้สมัครเอง — ต้องมีลิงก์คำเชิญจากทีม" };
  }
  const role =
    (await prisma.role.findUnique({ where: { name: "Member" } })) ?? (await prisma.role.findFirst({ orderBy: { level: "asc" } }));
  if (!role) return { error: "ระบบยังไม่พร้อมให้สมัคร" };

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { name: parsed.data.name, email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 10), roleId: role.id },
    });
    userId = user.id;
  } catch {
    return { error: "อีเมลนี้มีบัญชีอยู่แล้ว — เข้าสู่ระบบ หรือกดลืมรหัสผ่าน" };
  }
  await sendVerification(userId, parsed.data.email);
  await createSession(userId);
  redirect(next === "/" ? "/teams" : next);
}

/** ส่งลิงก์ยืนยันอีเมล (ถ้าตั้งค่าอีเมลไว้) */
async function sendVerification(userId: string, email: string) {
  if (!isEmailConfigured()) return false;
  const { token, tokenHash } = newToken();
  await prisma.authToken.create({ data: { userId, type: "EMAIL_VERIFY", tokenHash, expiresAt: inHours(48) } });
  return sendEmail({
    to: email,
    subject: "ยืนยันอีเมลของคุณบน Pace",
    heading: "ยืนยันอีเมล",
    body: "กดปุ่มด้านล่างเพื่อยืนยันว่าอีเมลนี้เป็นของคุณ เมื่อยืนยันแล้วคำเชิญเข้าทีมที่ส่งถึงอีเมลนี้จะขึ้นในแอปให้กดรับได้เลย\nลิงก์ใช้ได้ 48 ชั่วโมง",
    action: { label: "ยืนยันอีเมล", url: appUrl(`/verify-email/${token}`) },
  });
}

export async function resendVerification(): Promise<FormState> {
  const user = await requireUser();
  if (user.emailVerifiedAt) return { ok: "ยืนยันอีเมลแล้ว" };
  if (!isEmailConfigured()) return { error: "ระบบยังไม่ได้ตั้งค่าการส่งอีเมล" };
  // กันกดรัว: ส่งใหม่ได้ทุก 2 นาที
  const recent = await prisma.authToken.findFirst({
    where: { userId: user.id, type: "EMAIL_VERIFY", createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
  });
  if (recent) return { error: "เพิ่งส่งไป กรุณารอสักครู่แล้วลองใหม่" };
  return (await sendVerification(user.id, user.email)) ? { ok: `ส่งลิงก์ยืนยันไปที่ ${user.email} แล้ว` } : { error: "ส่งอีเมลไม่สำเร็จ" };
}

/** ใช้ token ครั้งเดียว — คืน userId ถ้าถูกต้องและยังไม่หมดอายุ */
async function consumeToken(token: string, type: "PASSWORD_RESET" | "EMAIL_VERIFY") {
  const used = await prisma.authToken.updateMany({
    where: { tokenHash: hashToken(token), type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (used.count !== 1) return null;
  return (await prisma.authToken.findUnique({ where: { tokenHash: hashToken(token) } }))?.userId ?? null;
}

export async function verifyEmail(token: string): Promise<boolean> {
  const userId = await consumeToken(token, "EMAIL_VERIFY");
  if (!userId) return false;
  await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

/** ขอลิงก์ตั้งรหัสผ่านใหม่ — ตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีบัญชีหรือไม่ */
export async function requestPasswordReset(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = z.email().trim().toLowerCase().safeParse(formData.get("email"));
  if (!parsed.success) return { error: "อีเมลไม่ถูกต้อง" };
  if (!isEmailConfigured()) return { error: "ระบบยังไม่ได้ตั้งค่าการส่งอีเมล — ติดต่อผู้ดูแลระบบให้รีเซ็ตรหัสผ่านให้" };
  if (!(await rateLimit(`forgot:ip:${await clientIp()}`, 8, 3600))) return { error: TOO_MANY };
  const user = await prisma.user.findUnique({ where: { email: parsed.data } });
  if (user?.active) {
    // กันส่งรัว: 1 ฉบับต่อ 2 นาที ต่อบัญชี
    const recent = await prisma.authToken.findFirst({
      where: { userId: user.id, type: "PASSWORD_RESET", createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
    });
    if (!recent) {
      const { token, tokenHash } = newToken();
      await prisma.authToken.create({ data: { userId: user.id, type: "PASSWORD_RESET", tokenHash, expiresAt: inHours(1) } });
      await sendEmail({
        to: user.email,
        subject: "ตั้งรหัสผ่านใหม่สำหรับ Pace",
        heading: "ตั้งรหัสผ่านใหม่",
        body: "มีคนขอตั้งรหัสผ่านใหม่ให้บัญชีนี้ ถ้าไม่ใช่คุณ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้\nลิงก์ใช้ได้ 1 ชั่วโมง และใช้ได้ครั้งเดียว",
        action: { label: "ตั้งรหัสผ่านใหม่", url: appUrl(`/reset-password/${token}`) },
      });
    }
  }
  return { ok: "ถ้าอีเมลนี้มีบัญชีอยู่ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว (ลิงก์ใช้ได้ 1 ชั่วโมง)" };
}

const ResetSchema = z
  .object({
    token: z.string().min(1),
    next: z.string().min(8, { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" }).max(200),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { error: "ยืนยันรหัสผ่านไม่ตรงกัน" });

export async function resetPassword(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = ResetSchema.safeParse({ token: formData.get("token"), next: formData.get("next"), confirm: formData.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const userId = await consumeToken(parsed.data.token, "PASSWORD_RESET");
  if (!userId) return { error: "ลิงก์นี้ใช้ไม่ได้แล้ว (หมดอายุหรือถูกใช้ไปแล้ว) — ขอลิงก์ใหม่อีกครั้ง" };
  // เปิดลิงก์จากอีเมลได้ = เป็นเจ้าของอีเมลนี้จริง
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 10), passwordChangedAt: new Date() },
  });
  if (!user.emailVerifiedAt) await prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  await createSession(userId);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

const PasswordSchema = z
  .object({
    current: z.string().min(1),
    next: z.string().min(8, { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร" }),
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { error: "ยืนยันรหัสผ่านไม่ตรงกัน" });

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = PasswordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 10), passwordChangedAt: new Date() },
  });
  // เครื่องอื่นหลุดออก — เครื่องนี้ออก session ใหม่ให้ใช้ต่อได้
  await createSession(user.id);
  return { ok: "เปลี่ยนรหัสผ่านเรียบร้อย — เครื่องอื่นที่เข้าสู่ระบบไว้จะถูกออกจากระบบ" };
}
