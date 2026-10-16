import "server-only";
import Stripe from "stripe";
import { prisma } from "./db";

/**
 * การชำระเงินผ่าน Stripe — แพ็กเกจทีมคิดต่อที่นั่ง (quantity ของ subscription = จำนวนที่นั่ง)
 * - ราคาหาจาก lookup key (สร้างด้วยปุ่มในหน้า admin → ชำระเงิน) — เปลี่ยนราคาใน Stripe ได้โดยไม่ต้องแก้โค้ด
 * - Stripe customer ผูกกับทีมระดับบน (Subscription.stripeCustomerId) — เหตุการณ์จาก Stripe หาทีมผ่าน customer นี้
 * - สถานะในฐานข้อมูลอัปเดตจาก webhook เป็นหลัก (และตอนกลับจากหน้าชำระเงิน) โดยดึงข้อมูลล่าสุดจาก Stripe ทุกครั้ง
 */
export const PRICE_KEYS = { month: "pace_team_monthly", year: "pace_team_yearly" } as const;
export type Interval = keyof typeof PRICE_KEYS;

/**
 * key ที่ใช้: เว็บจริงใช้ STRIPE_LIVE_SECRET_KEY (ตั้งเองบน Vercel) ถ้ามี — นอกนั้นใช้ STRIPE_SECRET_KEY (sandbox จาก Vercel Marketplace)
 * webhook secret คู่กัน: STRIPE_LIVE_WEBHOOK_SECRET / STRIPE_WEBHOOK_SECRET
 */
function credentials() {
  const live = process.env.VERCEL_ENV === "production" && process.env.STRIPE_LIVE_SECRET_KEY;
  return live
    ? { key: process.env.STRIPE_LIVE_SECRET_KEY as string, webhookSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET }
    : { key: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET };
}
const isTestKey = (key: string) => key.startsWith("sk_test_") || key.startsWith("rk_test_");

/** live = เงินจริง · test = sandbox · off = ไม่มี key หรือเป็น key ทดสอบบนเว็บจริง */
export function billingMode(): "live" | "test" | "off" {
  const { key } = credentials();
  if (!key) return "off";
  if (!isTestKey(key)) return "live";
  // เว็บจริงไม่ใช้ key ทดสอบ (ไม่งั้นใครก็ใช้บัตรทดสอบรับที่นั่งฟรีได้) เว้นแต่ตั้ง BILLING_ALLOW_TEST_KEYS=true
  return process.env.VERCEL_ENV !== "production" || process.env.BILLING_ALLOW_TEST_KEYS === "true" ? "test" : "off";
}
export const isBillingConfigured = () => billingMode() !== "off";
export const webhookSecret = () => credentials().webhookSecret;

let client: { key: string; stripe: Stripe } | undefined;
export function stripe() {
  const { key } = credentials();
  if (!client || client.key !== key) client = { key: key as string, stripe: new Stripe(key as string) };
  return client.stripe;
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

/** การตั้งค่าหน้าจัดการการชำระเงินที่สร้างโดย ensureCatalog (ไม่มี = ใช้ค่าเริ่มต้นของบัญชี) */
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

/* ---------- ตั้งค่าบัญชี Stripe (หน้า admin) ---------- */

const PRICE_SPECS = [
  { lookup_key: PRICE_KEYS.month, unit_amount: 9900, interval: "month" as const },
  { lookup_key: PRICE_KEYS.year, unit_amount: 99000, interval: "year" as const },
];

/** สร้างสินค้า "Pace ทีม" + ราคา ฿99/เดือน ฿990/ปี ต่อที่นั่ง + หน้าจัดการการชำระเงิน — รันซ้ำได้ ไม่สร้างซ้ำ */
export async function ensureCatalog() {
  const s = stripe();
  const existing = await s.prices.list({ lookup_keys: PRICE_SPECS.map((p) => p.lookup_key), active: true, expand: ["data.product"] });
  let product = existing.data[0]?.product as Stripe.Product | undefined;
  if (!product) {
    const found = await s.products.search({ query: "metadata['pace_plan']:'TEAM'" });
    product = found.data[0] ?? (await s.products.create({ name: "Pace ทีม (Team)", description: "ต่อที่นั่งต่อคน · per seat", metadata: { pace_plan: "TEAM" } }));
  }
  const prices: Stripe.Price[] = [];
  for (const p of PRICE_SPECS) {
    const have = existing.data.find((x) => x.lookup_key === p.lookup_key);
    prices.push(have ?? (await s.prices.create({ product: product.id, currency: "thb", unit_amount: p.unit_amount, recurring: { interval: p.interval }, lookup_key: p.lookup_key, tax_behavior: "inclusive" })));
  }
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: "at_period_end" },
    subscription_update: { enabled: true, default_allowed_updates: ["quantity", "price"], proration_behavior: "create_prorations", products: [{ product: product.id, prices: prices.map((p) => p.id) }] },
  };
  const mine = (await s.billingPortal.configurations.list({ active: true, limit: 100 })).data.find((c) => c.metadata?.pace === "portal");
  if (mine) await s.billingPortal.configurations.update(mine.id, { features });
  else await s.billingPortal.configurations.create({ features, business_profile: { headline: "Pace" }, metadata: { pace: "portal" } });
  priceCache = undefined;
  portalConfig = undefined;
}

/**
 * เปลี่ยนราคาต่อที่นั่ง (บาท) — Stripe แก้ราคาเดิมไม่ได้ จึงสร้างราคาใหม่ย้าย lookup key มา แล้วปิดราคาเดิม
 * ลูกค้าใหม่ได้ราคาใหม่ทันที · ลูกค้าเดิมยังจ่ายราคาเดิมจนกว่าจะย้ายราคาเอง
 */
export async function changeTeamPrice(interval: Interval, baht: number) {
  const s = stripe();
  const lookup_key = PRICE_KEYS[interval];
  const old = (await s.prices.list({ lookup_keys: [lookup_key], active: true })).data[0];
  if (!old) throw new Error("no price — run setup first");
  if (old.unit_amount === baht * 100) return;
  await s.prices.create({
    product: typeof old.product === "string" ? old.product : old.product.id,
    currency: old.currency,
    unit_amount: baht * 100,
    recurring: { interval },
    lookup_key,
    transfer_lookup_key: true,
    tax_behavior: old.tax_behavior ?? "inclusive",
  });
  await s.prices.update(old.id, { active: false });
  priceCache = undefined;
  portalConfig = undefined;
  // หน้าจัดการการชำระเงินต้องรู้จักราคาใหม่ (ให้ลูกค้าเปลี่ยนรายเดือน/รายปีได้)
  await ensureCatalog();
}

export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed",
  "invoice.paid", "invoice.payment_failed", "invoice.payment_action_required",
  "charge.refunded", "charge.dispute.created", "radar.early_fraud_warning.created",
];

/** สร้าง webhook ไปที่ url นี้ (ลบอันเดิมของ url เดียวกันก่อน) — คืน signing secret ซึ่ง Stripe ให้ดูได้ครั้งเดียว */
export async function recreateWebhook(url: string) {
  const s = stripe();
  for (const w of (await s.webhookEndpoints.list({ limit: 100 })).data) if (w.url === url) await s.webhookEndpoints.del(w.id);
  const ep = await s.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "Pace billing" });
  return ep.secret as string;
}

/** สถานะสำหรับหน้า admin */
export async function billingStatus(webhookUrl: string) {
  const mode = billingMode();
  if (mode === "off") return { mode } as const;
  const s = stripe();
  const [account, prices, portal, hooks] = await Promise.all([
    s.accounts.retrieveCurrent(),
    teamPrices(),
    portalConfiguration(),
    s.webhookEndpoints.list({ limit: 100 }),
  ]);
  const hook = hooks.data.find((w) => w.url === webhookUrl);
  return {
    mode,
    account: { id: account.id, country: account.country ?? "", name: account.settings?.dashboard?.display_name ?? "", charges: account.charges_enabled, payouts: account.payouts_enabled, due: account.requirements?.currently_due?.length ?? 0 },
    prices,
    portal: Boolean(portal),
    webhook: hook ? hook.status : null,
    webhookSecret: Boolean(webhookSecret()),
  } as const;
}
