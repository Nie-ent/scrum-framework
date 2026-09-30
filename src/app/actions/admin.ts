"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEVEL } from "@/lib/permissions";
import type { FormState } from "./auth";

const requireAdmin = () => requireUser(LEVEL.ADMIN);

function uniqueError(e: unknown, message: string): FormState {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: message };
  throw e;
}

/* ---------- Roles ---------- */

const RoleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, { error: "กรุณาระบุชื่อ role" }).max(50),
  level: z.coerce.number().int().min(1, { error: "level ต้องมากกว่า 0" }).max(1000),
  description: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
});

export async function saveRole(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const parsed = RoleSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    level: formData.get("level"),
    description: formData.get("description") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, ...data } = parsed.data;

  if (data.level > actor.role.level) {
    return { error: `กำหนด level ได้ไม่เกิน level ของตัวเอง (${actor.role.level})` };
  }
  if (id === actor.roleId && data.level < LEVEL.ADMIN) {
    return { error: "ลด level ของ role ตัวเองต่ำกว่า Admin ไม่ได้" };
  }

  try {
    if (id) await prisma.role.update({ where: { id }, data });
    else await prisma.role.create({ data });
  } catch (e) {
    return uniqueError(e, "มี role ชื่อนี้แล้ว");
  }
  revalidatePath("/admin/roles");
  return { ok: id ? "อัปเดต role แล้ว" : "สร้าง role แล้ว" };
}

export async function deleteRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const inUse = await prisma.user.count({ where: { roleId: id } });
  if (inUse === 0) await prisma.role.delete({ where: { id } });
  revalidatePath("/admin/roles");
}

/* ---------- Teams ---------- */

export async function saveTeam(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const id = (formData.get("id") as string) || undefined;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "กรุณาระบุชื่อทีม" };
  try {
    if (id) await prisma.team.update({ where: { id }, data: { name } });
    else await prisma.team.create({ data: { name } });
  } catch (e) {
    return uniqueError(e, "มีทีมชื่อนี้แล้ว");
  }
  revalidatePath("/admin/teams");
  return { ok: id ? "อัปเดตทีมแล้ว" : "สร้างทีมแล้ว" };
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  await prisma.team.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath("/admin/teams");
}

/* ---------- Users ---------- */

const UserSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, { error: "กรุณาระบุชื่อ" }).max(100),
  email: z.email({ error: "อีเมลไม่ถูกต้อง" }).trim().toLowerCase(),
  roleId: z.string().min(1, { error: "กรุณาเลือก role" }),
  teamId: z.string().transform((v) => v || null),
  active: z.boolean(),
  password: z.string().refine((v) => v === "" || v.length >= 8, {
    error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
  }),
});

export async function saveUser(_: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireAdmin();
  const parsed = UserSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    email: formData.get("email"),
    roleId: formData.get("roleId") ?? "",
    teamId: formData.get("teamId") ?? "",
    active: formData.get("active") === "on",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, password, ...data } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) return { error: "ไม่พบ role" };
  if (role.level > actor.role.level) return { error: "กำหนด role ที่สูงกว่าตัวเองไม่ได้" };

  if (id) {
    const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
    if (!target) return { error: "ไม่พบผู้ใช้" };
    if (target.role.level > actor.role.level) return { error: "แก้ไขผู้ใช้ที่ level สูงกว่าตัวเองไม่ได้" };
    if (id === actor.id && (!data.active || role.level < LEVEL.ADMIN)) {
      return { error: "ปิดบัญชีหรือลดสิทธิ์ตัวเองไม่ได้" };
    }
  } else if (!password) {
    return { error: "กรุณาตั้งรหัสผ่านเริ่มต้น" };
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  try {
    if (id) await prisma.user.update({ where: { id }, data: { ...data, passwordHash } });
    else await prisma.user.create({ data: { ...data, passwordHash: passwordHash! } });
  } catch (e) {
    return uniqueError(e, "มีผู้ใช้อีเมลนี้แล้ว");
  }
  revalidatePath("/admin/users");
  return { ok: id ? "อัปเดตผู้ใช้แล้ว" : "สร้างผู้ใช้แล้ว" };
}
