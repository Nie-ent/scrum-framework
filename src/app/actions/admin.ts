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
  const parentId = (formData.get("parentId") as string) || null;
  if (!name) return { error: "กรุณาระบุชื่อทีม" };

  // ซ้อนได้ 2 ชั้น: ทีมแม่ต้องเป็นทีมระดับบน และทีมที่มีทีมย่อยแล้วจะไปเป็นทีมย่อยของใครไม่ได้
  if (parentId) {
    if (parentId === id) return { error: "ทีมเป็นทีมแม่ของตัวเองไม่ได้" };
    const parent = await prisma.team.findUnique({ where: { id: parentId } });
    if (!parent) return { error: "ไม่พบทีมแม่" };
    if (parent.parentId) return { error: "เลือกได้เฉพาะทีมระดับบนเป็นทีมแม่ (ซ้อนได้ 2 ชั้น)" };
    if (id && (await prisma.team.count({ where: { parentId: id } })) > 0) {
      return { error: "ทีมนี้มีทีมย่อยอยู่แล้ว จึงเป็นทีมย่อยของทีมอื่นไม่ได้" };
    }
  }

  try {
    if (id) await prisma.team.update({ where: { id }, data: { name, parentId } });
    else await prisma.team.create({ data: { name, parentId } });
  } catch (e) {
    return uniqueError(e, "มีทีมชื่อนี้แล้ว");
  }
  revalidatePath("/admin/teams");
  return { ok: id ? "อัปเดตทีมแล้ว" : "สร้างทีมแล้ว" };
}

export async function deleteTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  if ((await prisma.team.count({ where: { parentId: id } })) === 0) {
    await prisma.team.delete({ where: { id } });
  }
  revalidatePath("/admin/teams");
}

/* ---------- Users ---------- */

const UserSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, { error: "กรุณาระบุชื่อ" }).max(100),
  email: z.email({ error: "อีเมลไม่ถูกต้อง" }).trim().toLowerCase(),
  roleId: z.string().min(1, { error: "กรุณาเลือก role" }),
  teams: z.array(z.string()),
  leads: z.array(z.string()),
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
    teams: formData.getAll("teams"),
    leads: formData.getAll("leads"),
    active: formData.get("active") === "on",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, password, teams, leads, ...data } = parsed.data;

  const role = await prisma.role.findUnique({ where: { id: data.roleId } });
  if (!role) return { error: "ไม่พบ role" };
  if (role.level > actor.role.level) return { error: "กำหนด role ที่สูงกว่าตัวเองไม่ได้" };

  // ติ๊กหัวหน้าทีมไหน = เป็นสมาชิกทีมนั้นด้วย
  const leadIds = new Set(leads);
  const teamIds = [...new Set([...teams, ...leads])];
  if ((await prisma.team.count({ where: { id: { in: teamIds } } })) !== teamIds.length) {
    return { error: "ไม่พบบางทีม กรุณารีเฟรชหน้า" };
  }
  const memberships = teamIds.map((teamId) => ({ teamId, isLead: leadIds.has(teamId) }));

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
    if (id) {
      await prisma.$transaction([
        prisma.user.update({ where: { id }, data: { ...data, passwordHash } }),
        prisma.teamMember.deleteMany({ where: { userId: id } }),
        prisma.teamMember.createMany({ data: memberships.map((m) => ({ ...m, userId: id })) }),
      ]);
    } else {
      await prisma.user.create({
        data: { ...data, passwordHash: passwordHash!, memberships: { create: memberships } },
      });
    }
  } catch (e) {
    return uniqueError(e, "มีผู้ใช้อีเมลนี้แล้ว");
  }
  revalidatePath("/admin/users");
  return { ok: id ? "อัปเดตผู้ใช้แล้ว" : "สร้างผู้ใช้แล้ว" };
}
