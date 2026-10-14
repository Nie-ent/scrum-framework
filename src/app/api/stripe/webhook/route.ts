import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { isBillingConfigured, stripe, syncSubscription } from "@/lib/billing";

/**
 * เหตุการณ์จาก Stripe — ตรวจลายเซ็นทุกครั้ง แล้วดึงสถานะ subscription ล่าสุดจาก Stripe มาบันทึก
 * (ไม่เชื่อข้อมูลในเหตุการณ์ตรง ๆ จึงไม่มีปัญหาเหตุการณ์มาสลับลำดับ) · BillingEvent กันทำซ้ำเมื่อ Stripe ส่งซ้ำ
 */
const subscriptionOf = (v: string | { id: string } | null | undefined) => (v ? (typeof v === "string" ? v : v.id) : null);

async function subscriptionIdOf(event: Stripe.Event): Promise<string | null> {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.async_payment_failed":
      return subscriptionOf((o as Stripe.Checkout.Session).subscription);
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return (o as Stripe.Subscription).id;
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.payment_action_required":
      return subscriptionOf((o as Stripe.Invoice).parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

// เงินถูกดึงกลับ (คืนเงิน/โต้แย้ง/สงสัยทุจริต) — แพ็กเกจยังเปลี่ยนตามสถานะ subscription เอง ที่นี่แค่บันทึกให้ผู้ดูแลตามต่อใน Stripe
const RISK_EVENTS = new Set(["charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created"]);

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!isBillingConfigured() || !secret) return new Response("billing not configured", { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return new Response("bad signature", { status: 400 });
  }
  if (await prisma.billingEvent.findUnique({ where: { id: event.id }, select: { id: true } })) return Response.json({ received: true, duplicate: true });

  if (RISK_EVENTS.has(event.type)) {
    console.warn(`[stripe] ${event.type} ${(event.data.object as { id: string }).id} — ตรวจสอบใน Stripe Dashboard`);
  } else {
    const subscriptionId = await subscriptionIdOf(event);
    // ล้มเหลว → ตอบ 500 ให้ Stripe ส่งมาใหม่ (ยังไม่บันทึก BillingEvent)
    if (subscriptionId) await syncSubscription(subscriptionId);
  }
  await prisma.billingEvent.upsert({ where: { id: event.id }, create: { id: event.id, type: event.type }, update: {} });
  return Response.json({ received: true });
}
