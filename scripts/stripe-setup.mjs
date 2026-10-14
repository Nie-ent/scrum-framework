// สร้างสินค้า "Pace ทีม" + ราคา (รายเดือน/รายปี ต่อที่นั่ง) และการตั้งค่าหน้าจัดการการชำระเงินใน Stripe
// รันซ้ำได้ — หาด้วย lookup_key/metadata ก่อน ไม่สร้างซ้ำ
// ใช้: node --env-file=.env.local scripts/stripe-setup.mjs   (ใช้กับ key ของบัญชีจริงตอนเปิดรับเงินจริงด้วย)
// เปลี่ยนราคาทีหลัง: สร้างราคาใหม่ใน Dashboard แล้วย้าย lookup key (pace_team_monthly / pace_team_yearly) ไปที่ราคาใหม่
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PRICES = [
  { lookup_key: "pace_team_monthly", unit_amount: 9900, interval: "month" },
  { lookup_key: "pace_team_yearly", unit_amount: 99000, interval: "year" },
];

const existing = await stripe.prices.list({ lookup_keys: PRICES.map((p) => p.lookup_key), active: true, expand: ["data.product"] });
let product = existing.data[0]?.product;
if (!product) {
  const found = await stripe.products.search({ query: "metadata['pace_plan']:'TEAM'" });
  product = found.data[0] ?? (await stripe.products.create({ name: "Pace ทีม (Team)", description: "ต่อที่นั่งต่อคน · per seat", metadata: { pace_plan: "TEAM" } }));
}
const prices = [];
for (const p of PRICES) {
  const have = existing.data.find((x) => x.lookup_key === p.lookup_key);
  prices.push(have ?? (await stripe.prices.create({ product: product.id, currency: "thb", unit_amount: p.unit_amount, recurring: { interval: p.interval }, lookup_key: p.lookup_key, tax_behavior: "inclusive" })));
}
console.log("product", product.id, "prices", prices.map((p) => `${p.lookup_key}=${p.id}`).join(" "));

// หน้าจัดการการชำระเงิน: เปลี่ยนจำนวนที่นั่ง/รายเดือน↔รายปี, เปลี่ยนบัตร, ใบเสร็จ, ยกเลิกเมื่อครบรอบ
const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
const features = {
  customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "tax_id"] },
  invoice_history: { enabled: true },
  payment_method_update: { enabled: true },
  subscription_cancel: { enabled: true, mode: "at_period_end" },
  subscription_update: { enabled: true, default_allowed_updates: ["quantity", "price"], proration_behavior: "create_prorations", products: [{ product: product.id, prices: prices.map((p) => p.id) }] },
};
const mine = configs.data.find((c) => c.metadata?.pace === "portal" && c.active);
const portal = mine
  ? await stripe.billingPortal.configurations.update(mine.id, { features })
  : await stripe.billingPortal.configurations.create({ features, business_profile: { headline: "Pace" }, metadata: { pace: "portal" } });
console.log("portal", portal.id);
