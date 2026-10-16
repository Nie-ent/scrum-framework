"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { LEVEL } from "@/lib/permissions";
import type { FormState } from "./auth";
import { getTr } from "@/lib/i18n/server";
import { changeTeamPrice, ensureCatalog, isBillingConfigured, recreateWebhook } from "@/lib/billing";
import { saveSettings } from "@/lib/settings";
import { publicOrigin } from "@/lib/origin";

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
    return { error: (await getTr())("กำหนด level ได้ไม่เกิน level ของตัวเอง ({0})", [actor.role.level]) };
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
    if (!parent || parent.personalOfId) return { error: "ไม่พบทีมแม่" };
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
  // พื้นที่ส่วนตัวของผู้ใช้ลบจากหน้านี้ไม่ได้
  if ((await prisma.team.count({ where: { parentId: id } })) === 0) {
    await prisma.team.deleteMany({ where: { id, personalOfId: null } });
  }
  revalidatePath("/admin/teams");
}

/** ให้แพ็กเกจทีมฟรีแก่ workspace (ลูกค้าทดลอง / พาร์ตเนอร์) — ที่นั่ง 0 หรือเว้นวันที่ = ยกเลิกสิทธิ์ที่ให้ */
const CompSchema = z.object({
  teamId: z.string().min(1),
  seats: z.coerce.number().int().min(0).max(10000),
  until: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
});

export async function grantPlan(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = CompSchema.safeParse({ teamId: formData.get("teamId"), seats: formData.get("seats") || 0, until: formData.get("until") ?? "" });
  if (!parsed.success) return { error: "ข้อมูลไม่ถูกต้อง" };
  const { teamId, seats, until } = parsed.data;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { parentId: true, personalOfId: true } });
  if (!team || team.parentId || team.personalOfId) return { error: "ให้แพ็กเกจได้เฉพาะทีมระดับบน" };
  const comp = seats > 0 && until ? { compSeats: seats, compUntil: new Date(`${until}T23:59:59+07:00`) } : { compSeats: null, compUntil: null };
  await prisma.subscription.upsert({ where: { teamId }, create: { teamId, ...comp }, update: comp });
  revalidatePath("/admin/teams");
  return { ok: comp.compSeats ? "ให้แพ็กเกจแล้ว" : "ยกเลิกสิทธิ์ที่ให้แล้ว" };
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
  if ((await prisma.team.count({ where: { id: { in: teamIds }, personalOfId: null } })) !== teamIds.length) {
    return { error: "ไม่พบบางทีม กรุณารีเฟรชหน้า" };
  }
  // ชื่อบทบาทในทีมตั้งต้น = ชื่อ role (แก้รายทีมได้ภายหลัง)
  const memberships = teamIds.map((teamId) => ({
    teamId,
    access: leadIds.has(teamId) ? ("LEAD" as const) : ("MEMBER" as const),
    isLead: leadIds.has(teamId),
    title: role.name,
  }));

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
      // แก้เฉพาะส่วนที่เปลี่ยน: ทีมที่อยู่ต่อจะคงชื่อบทบาท/สถานะผู้ดูแลเดิมไว้ และเจ้าของทีมยังเป็นเจ้าของ
      const existing = new Map((await prisma.teamMember.findMany({ where: { userId: id } })).map((m) => [m.teamId, m]));
      await prisma.$transaction([
        // รีเซ็ตรหัสผ่านให้ = session เดิมของคนนั้นใช้ไม่ได้
        prisma.user.update({ where: { id }, data: { ...data, passwordHash, ...(passwordHash ? { passwordChangedAt: new Date() } : {}) } }),
        // ไม่แตะพื้นที่ส่วนตัวของผู้ใช้
        prisma.teamMember.deleteMany({ where: { userId: id, teamId: { notIn: teamIds }, team: { personalOfId: null } } }),
        ...memberships.map((m) => {
          const access = existing.get(m.teamId)?.access === "OWNER" && m.isLead ? ("OWNER" as const) : m.access;
          return prisma.teamMember.upsert({
            where: { userId_teamId: { userId: id, teamId: m.teamId } },
            create: { ...m, userId: id },
            update: { access, isLead: m.isLead },
          });
        }),
      ]);
    } else {
      await prisma.user.create({
        // ผู้ดูแลสร้างให้ = ถือว่ายืนยันอีเมลแล้ว
        data: { ...data, passwordHash: passwordHash!, emailVerifiedAt: new Date(), memberships: { create: memberships } },
      });
    }
  } catch (e) {
    return uniqueError(e, "มีผู้ใช้อีเมลนี้แล้ว");
  }
  revalidatePath("/admin/users");
  return { ok: id ? "อัปเดตผู้ใช้แล้ว" : "สร้างผู้ใช้แล้ว" };
}

/* ---------- ชำระเงิน (Stripe) ---------- */

export type BillingSetupState = { error?: string; ok?: string; secret?: string } | undefined;

/** สร้างสินค้า/ราคา/หน้าจัดการการชำระเงินในบัญชี Stripe ที่ใช้อยู่ — หลังจากนี้เจ้าของทีมเห็นปุ่มอัปเกรด */
export async function setupBillingCatalog(): Promise<BillingSetupState> {
  await requireAdmin();
  const t = await getTr();
  if (!isBillingConfigured()) return { error: t("ยังไม่เปิดระบบชำระเงิน") };
  try {
    await ensureCatalog();
  } catch (e) {
    return { error: t("Stripe ตอบกลับว่า: {0}", [e instanceof Error ? e.message : String(e)]) };
  }
  revalidatePath("/admin/billing");
  return { ok: t("ตั้งค่าสินค้าและราคาแล้ว") };
}

/** แพ็กเกจฟรีกี่คน + เปิดให้สมัครเองไหม — มีผลทันทีไม่ต้อง deploy */
export async function savePlanSettings(_: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const t = await getTr();
  const parsed = z
    .object({ freeSeats: z.coerce.number().int().min(0).max(10000), allowSignup: z.boolean() })
    .safeParse({ freeSeats: formData.get("freeSeats"), allowSignup: formData.get("allowSignup") === "on" });
  if (!parsed.success) return { error: t("ข้อมูลไม่ถูกต้อง") };
  await saveSettings(parsed.data);
  revalidatePath("/", "layout");
  return { ok: t("บันทึกแล้ว") };
}

/** เปลี่ยนราคาต่อที่นั่งใน Stripe */
export async function saveTeamPrices(_: BillingSetupState, formData: FormData): Promise<BillingSetupState> {
  await requireAdmin();
  const t = await getTr();
  if (!isBillingConfigured()) return { error: t("ยังไม่เปิดระบบชำระเงิน") };
  const parsed = z
    .object({ month: z.coerce.number().int().min(1).max(100000), year: z.coerce.number().int().min(1).max(1000000) })
    .safeParse({ month: formData.get("month"), year: formData.get("year") });
  if (!parsed.success) return { error: t("ราคาต้องเป็นจำนวนเต็มบาทและมากกว่า 0") };
  try {
    await changeTeamPrice("month", parsed.data.month);
    await changeTeamPrice("year", parsed.data.year);
  } catch (e) {
    return { error: t("Stripe ตอบกลับว่า: {0}", [e instanceof Error ? e.message : String(e)]) };
  }
  revalidatePath("/", "layout");
  return { ok: t("เปลี่ยนราคาแล้ว — ลูกค้าใหม่จ่ายราคานี้ ลูกค้าเดิมยังจ่ายราคาเดิม") };
}

/** สร้าง webhook ใหม่ไปที่เว็บนี้ แล้วแสดง signing secret ครั้งเดียวให้นำไปใส่บน Vercel */
export async function setupBillingWebhook(): Promise<BillingSetupState> {
  await requireAdmin();
  const t = await getTr();
  if (!isBillingConfigured()) return { error: t("ยังไม่เปิดระบบชำระเงิน") };
  try {
    const secret = await recreateWebhook(`${await publicOrigin()}/api/stripe/webhook`);
    revalidatePath("/admin/billing");
    return { ok: t("สร้าง webhook แล้ว"), secret };
  } catch (e) {
    return { error: t("Stripe ตอบกลับว่า: {0}", [e instanceof Error ? e.message : String(e)]) };
  }
}
