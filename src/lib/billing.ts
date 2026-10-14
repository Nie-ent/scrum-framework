import "server-only";
import Stripe from "stripe";
import { prisma } from "./db";

/**
 * การชำระเงินผ่าน Stripe — แพ็กเกจทีมคิดต่อที่นั่ง (quantity ของ subscription = จำนวนที่นั่ง)
 * - ราคาหาจาก lookup key (ตั้งด้วย scripts/stripe-setup.mjs) — เปลี่ยนราคาใน Stripe ได้โดยไม่ต้องแก้โค้ด
 * - Stripe customer ผูกกับทีมระดับบน (Subscription.stripeCustomerId) — เหตุการณ์จาก Stripe หาทีมผ่าน customer นี้
 * - สถานะในฐานข้อมูลอัปเดตจาก webhook เป็นหลัก (และตอนกลับจากหน้าชำระเงิน) โดยดึงข้อมูลล่าสุดจาก Stripe ทุกครั้ง
 */
export const PRICE_KEYS = { month: "pace_team_monthly", year: "pace_team_yearly" } as const;
export type Interval = keyof typeof PRICE_KEYS;

/**
 * เปิดปุ่มชำระเงินเมื่อมี key — แต่บนเว็บจริงไม่ใช้ key ทดสอบ (ไม่งั้นใครก็ใช้บัตรทดสอบรับที่นั่งฟรีได้)
 * จนกว่าจะเปลี่ยนเป็น key จริง หรือตั้ง BILLING_ALLOW_TEST_KEYS=true เพื่อลองบนเว็บจริงชั่วคราว
 */
export function isBillingConfigured() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return false;
  const testKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  return !testKey || process.env.VERCEL_ENV !== "production" || process.env.BILLING_ALLOW_TEST_KEYS === "true";
}

let client: Stripe | undefined;
export function stripe() {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY as string);
  return client;
}

export type PriceInfo = { id: string; interval: Interval; amount: number; currency: string };

let priceCache: { at: number; prices: PriceInfo[] } | undefined;
export async function teamPrices(): Promise<PriceInfo[]> {
  if (priceCache && Date.now() - priceCache.at < 10 * 60_000) return priceCache.prices;
  const list = await stripe().prices.list({ lookup_keys: Object.values(PRICE_KEYS), active: true });
  const prices = list.data.flatMap((p) => {
    const interval = (Object.keys(PRICE_KEYS) as Interval[]).find((k) => PRICE_KEYS[k] === p.lookup_key);
    return interval && p.unit_amount !== null ? [{ id: p.id, interval, amount: p.unit_amount / 100, currency: p.currency }] : [];
  });
  priceCache = { at: Date.now(), prices };
  return prices;
}

/** การตั้งค่าหน้าจัดการการชำระเงินที่สร้างโดย scripts/stripe-setup.mjs (ไม่มี = ใช้ค่าเริ่มต้นของบัญชี) */
let portalConfig: string | null | undefined;
export async function portalConfiguration() {
  if (portalConfig === undefined) {
    const list = await stripe().billingPortal.configurations.list({ active: true, limit: 100 });
    portalConfig = list.data.find((c) => c.metadata?.pace === "portal")?.id ?? null;
  }
  return portalConfig ?? undefined;
}

const OUR_PRICES = new Set<string>(Object.values(PRICE_KEYS));

/** บันทึกสถานะ subscription ล่าสุดจาก Stripe ลงทีมที่เป็นเจ้าของ customer นั้น — คืน teamId หรือ null ถ้าไม่ใช่ของเรา */
export async function syncSubscription(subscriptionId: string): Promise<string | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const row = await prisma.subscription.findUnique({ where: { stripeCustomerId: customerId }, select: { teamId: true, stripeSubscriptionId: true, status: true } });
  if (!row) return null;
  // customer หนึ่งมีได้หลาย subscription (เช่นอันเก่าที่ยกเลิกแล้ว) — ไม่ให้อันที่จบไปแล้วทับอันที่ยังใช้อยู่
  if (row.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && ["active", "trialing", "past_due"].includes(row.status) && !["active", "trialing", "past_due"].includes(sub.status)) {
    return row.teamId;
  }
  const items = sub.items.data.filter((i) => i.price.lookup_key && OUR_PRICES.has(i.price.lookup_key));
  const seats = items.reduce((n, i) => n + (i.quantity ?? 0), 0);
  const periodEnd = items[0]?.current_period_end;
  await prisma.subscription.update({
    where: { teamId: row.teamId },
    data: {
      plan: "TEAM",
      seats,
      status: sub.status,
      stripeSubscriptionId: sub.id,
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at !== null,
      currentPeriodEnd: sub.cancel_at ? new Date(sub.cancel_at * 1000) : periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });
  return row.teamId;
}

/** customer ของ workspace นี้ — สร้างครั้งแรกที่มีคนกดอัปเกรด */
export async function customerFor(team: { id: string; name: string }, payer: { email: string; name: string }) {
  const row = await prisma.subscription.findUnique({ where: { teamId: team.id }, select: { stripeCustomerId: true } });
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  // กดซ้ำพร้อมกัน → ได้ customer เดิม (Stripe จำ idempotency key ไว้ 24 ชม.)
  const customer = await stripe().customers.create({ email: payer.email, name: team.name, metadata: { pace_team_id: team.id } }, { idempotencyKey: `pace-customer-${team.id}` });
  await prisma.subscription.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, plan: "FREE", stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}
