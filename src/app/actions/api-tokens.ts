"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { hashToken } from "@/lib/tokens";
import type { FormState } from "./auth";

const MAX_TOKENS = 10;

/** สร้างโทเคนส่วนตัวสำหรับเชื่อมผู้ช่วย AI (MCP) — ตัวโทเคนส่งกลับครั้งเดียวใน id แล้วไม่เก็บไว้ (เก็บแค่ hash) */
export async function createApiToken(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  if (!name) return { error: "กรุณาตั้งชื่อ" };
  if ((await prisma.apiToken.count({ where: { userId: user.id } })) >= MAX_TOKENS) return { error: "มีโทเคนครบจำนวนแล้ว — ยกเลิกอันที่ไม่ใช้ก่อน" };
  const token = `pace_${randomBytes(32).toString("base64url")}`;
  await prisma.apiToken.create({ data: { userId: user.id, name, tokenHash: hashToken(token), readOnly: formData.get("readOnly") === "on" } });
  revalidatePath("/account");
  return { ok: "สร้างโทเคนแล้ว — คัดลอกเก็บไว้ตอนนี้ จะไม่แสดงอีก", id: token };
}

/** ยกเลิกโทเคน: ผู้ช่วยที่ใช้โทเคนนี้จะเชื่อมต่อไม่ได้ทันที */
export async function revokeApiToken(formData: FormData) {
  const user = await requireUser();
  await prisma.apiToken.deleteMany({ where: { id: String(formData.get("id") ?? ""), userId: user.id } }).catch(() => undefined);
  revalidatePath("/account");
}
