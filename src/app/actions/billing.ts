"use server";

import { redirect } from "next/navigation";
import * as z from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getTeamControl } from "@/lib/teams";
import { workspaceUsage } from "@/lib/plans";
import { customerFor, isBillingConfigured, portalConfiguration, stripe, teamPrices } from "@/lib/billing";
import { publicOrigin } from "@/lib/origin";
import { ensureLang, getTr } from "@/lib/i18n/server";
import type { FormState } from "./auth";

/** เฉพาะเจ้าของทีมระดับบน (ทีมย่อยใช้แพ็กเกจของทีมแม่) */
async function ownedWorkspace(teamId: string) {
  const user = await requireUser();
  const control = await getTeamControl(user, teamId);
  if (!control?.owner || control.team.parentId) return null;
  return { user, team: control.team };
}

const MAX_SEATS = 1000;
const CheckoutSchema = z.object({
  teamId: z.string().min(1),
  interval: z.enum(["month", "year"]),
  seats: z.coerce.number().int().min(1).max(MAX_SEATS),
});

/** ไปหน้าชำระเงินของ Stripe — สมัครแพ็กเกจทีมตามจำนวนที่นั่ง */
export async function startCheckout(_: FormState, formData: FormData): Promise<FormState> {
  const t = await getTr();
  if (!isBillingConfigured()) return { error: t("ยังไม่เปิดระบบชำระเงิน") };
  const parsed = CheckoutSchema.safeParse({ teamId: formData.get("teamId"), interval: formData.get("interval"), seats: formData.get("seats") });
  if (!parsed.success) return { error: t("จำนวนที่นั่งต้องเป็น 1–{0}", [MAX_SEATS]) };
  const ws = await ownedWorkspace(parsed.data.teamId);
  if (!ws) return { error: t("เฉพาะเจ้าของทีมจัดการแพ็กเกจได้") };

  const sub = await prisma.subscription.findUnique({ where: { teamId: ws.team.id }, select: { status: true, stripeSubscriptionId: true } });
  // มีแพ็กเกจที่จ่ายอยู่แล้ว → เปลี่ยนที่นั่งในหน้าจัดการการชำระเงินแทน (กันสมัครซ้อน)
  if (sub?.stripeSubscriptionId && ["active", "trialing", "past_due", "incomplete"].includes(sub.status)) return openPortalFor(ws.team.id);

  const { used, pending } = await workspaceUsage(ws.team.id);
  const minimum = Math.max(1, used + pending);
  if (parsed.data.seats < minimum) return { error: t("ต้องมีอย่างน้อย {0} ที่นั่ง เท่ากับจำนวนคนในทีมตอนนี้", [minimum]) };
  const price = (await teamPrices()).find((p) => p.interval === parsed.data.interval);
  if (!price) return { error: t("ยังไม่ได้ตั้งราคาในระบบชำระเงิน") };

  let url: string | null;
  try {
    const customer = await customerFor(ws.team, ws.user);
    const origin = await publicOrigin();
    const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ws.team.id,
    line_items: [{ price: price.id, quantity: parsed.data.seats, adjustable_quantity: { enabled: true, minimum, maximum: MAX_SEATS } }],
    success_url: `${origin}/teams/${ws.team.id}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/teams/${ws.team.id}?billing=cancel`,
    locale: await ensureLang(),
    customer_update: { name: "auto", address: "auto" },
    tax_id_collection: { enabled: true },
    integration_identifier: "pace_team_seats_qvhtzmxb",
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] checkout", e);
    url = null;
  }
  if (!url) return { error: t("เปิดหน้าชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง") };
  redirect(url);
}

async function openPortalFor(teamId: string): Promise<FormState> {
  const t = await getTr();
  const row = await prisma.subscription.findUnique({ where: { teamId }, select: { stripeCustomerId: true } });
  if (!row?.stripeCustomerId) return { error: t("ทีมนี้ยังไม่เคยชำระเงิน") };
  let url: string | null;
  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${await publicOrigin()}/teams/${teamId}`,
      configuration: await portalConfiguration(),
      locale: await ensureLang(),
    });
    url = session.url;
  } catch (e) {
    console.error("[billing] portal", e);
    url = null;
  }
  if (!url) return { error: t("เปิดหน้าจัดการการชำระเงินไม่สำเร็จ ลองใหม่อีกครั้ง") };
  redirect(url);
}

/** หน้าจัดการการชำระเงินของ Stripe: เพิ่ม/ลดที่นั่ง เปลี่ยนรอบบิล เปลี่ยนบัตร ใบเสร็จ ยกเลิก */
export async function openBillingPortal(_: FormState, formData: FormData): Promise<FormState> {
  const t = await getTr();
  if (!isBillingConfigured()) return { error: t("ยังไม่เปิดระบบชำระเงิน") };
  const ws = await ownedWorkspace(String(formData.get("teamId") ?? ""));
  if (!ws) return { error: t("เฉพาะเจ้าของทีมจัดการแพ็กเกจได้") };
  return openPortalFor(ws.team.id);
}
