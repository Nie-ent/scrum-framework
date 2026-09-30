"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createSession, deleteSession } from "@/lib/session";

export type FormState = { error?: string; ok?: string } | undefined;

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

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  const valid = user && user.active && (await bcrypt.compare(parsed.data.password, user.passwordHash));
  if (!valid) return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };

  await createSession(user.id);
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
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 10) },
  });
  return { ok: "เปลี่ยนรหัสผ่านเรียบร้อย" };
}
