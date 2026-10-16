import { billingStatus } from "@/lib/billing";
import { publicOrigin } from "@/lib/origin";
import { tr } from "@/lib/i18n/server";
import { getSettings } from "@/lib/settings";
import { BillingCatalogForm, BillingWebhookForm, PlanSettingsForm, TeamPriceForm } from "../forms";

/** สถานะระบบชำระเงิน (Stripe) และขั้นตอนตั้งค่าที่ทำได้จากเว็บ — key จริงเป็น Sensitive บน Vercel จึงตั้งค่าจากเครื่องไม่ได้ */
export default async function BillingAdminPage() {
  const webhookUrl = `${await publicOrigin()}/api/stripe/webhook`;
  const settings = await getSettings();
  const planCard = (
    <div className="card space-y-3">
      <h2 className="font-semibold">{tr("แพ็กเกจฟรีและการสมัคร")}</h2>
      <PlanSettingsForm freeSeats={settings.freeSeats} allowSignup={settings.allowSignup} />
    </div>
  );
  const status = await billingStatus(webhookUrl).catch((e: unknown) => ({ mode: "error" as const, message: e instanceof Error ? e.message : String(e) }));

  if (status.mode === "off" || status.mode === "error") {
    return (
      <div className="space-y-4">
      {planCard}
      <div className="card space-y-2">
        <h2 className="font-semibold">{tr("ระบบชำระเงินปิดอยู่")}</h2>
        <p className="text-sm text-muted-foreground">
          {status.mode === "error"
            ? tr("เชื่อมต่อ Stripe ไม่สำเร็จ: {0}", [status.message])
            : tr("ยังไม่มี key ของ Stripe หรือเว็บจริงยังใช้ key ทดสอบอยู่ — ใส่ STRIPE_LIVE_SECRET_KEY บน Vercel (Production) แล้ว redeploy")}
        </p>
      </div>
      </div>
    );
  }

  const live = status.mode === "live";
  const { account } = status;
  const month = status.prices.find((p) => p.interval === "month");
  const year = status.prices.find((p) => p.interval === "year");
  const ok = (v: boolean) => (v ? "badge badge-success" : "badge badge-danger");
  return (
    <div className="space-y-4">
      {planCard}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{tr("บัญชี Stripe")}</h2>
          <span className={live ? "badge badge-success" : "badge badge-neutral"}>{live ? tr("เงินจริง") : tr("โหมดทดสอบ")}</span>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{tr("ชื่อ")}</dt>
          <dd>{account.name || account.id}</dd>
          <dt className="text-muted-foreground">{tr("ประเทศ")}</dt>
          <dd>
            {account.country}
            {live && account.country !== "TH" && <span className="ml-2 text-warning">{tr("บัญชีไม่ใช่ประเทศไทย — เงินจะไม่เข้าบัญชีธนาคารไทย")}</span>}
          </dd>
          <dt className="text-muted-foreground">{tr("รับชำระเงิน")}</dt>
          <dd><span className={ok(account.charges)}>{account.charges ? tr("พร้อม") : tr("ยังไม่พร้อม")}</span></dd>
          <dt className="text-muted-foreground">{tr("โอนเงินเข้าบัญชี")}</dt>
          <dd><span className={ok(account.payouts)}>{account.payouts ? tr("พร้อม") : tr("ยังไม่พร้อม")}</span></dd>
        </dl>
        {account.due > 0 && <p className="text-sm text-warning">{tr("Stripe ยังต้องการข้อมูลอีก {0} รายการ — กรอกใน Stripe Dashboard", [account.due])}</p>}
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{tr("1. สินค้าและราคา")}</h2>
        {status.prices.length > 0 ? (
          <ul className="text-sm">
            {status.prices.map((p) => (
              <li key={p.id}>
                {p.interval === "month" ? tr("รายเดือน") : tr("รายปี")}: {new Intl.NumberFormat("th-TH", { style: "currency", currency: p.currency.toUpperCase(), maximumFractionDigits: 0 }).format(p.amount)} {tr("ต่อที่นั่ง")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{tr("ยังไม่มีราคาในบัญชีนี้ — เจ้าของทีมยังไม่เห็นปุ่มอัปเกรด")}</p>
        )}
        <p className="text-sm text-muted-foreground">{tr("หน้าจัดการการชำระเงินของลูกค้า: {0}", [status.portal ? tr("ตั้งค่าแล้ว") : tr("ยังไม่ได้ตั้งค่า")])}</p>
        {month && year && <TeamPriceForm month={month.amount} year={year.amount} />}
        <BillingCatalogForm live={live} ready={status.prices.length > 0} />
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">{tr("2. Webhook (Stripe แจ้งผลการชำระเงินกลับมา)")}</h2>
        <p className="text-sm text-muted-foreground">
          <code className="text-xs">{webhookUrl}</code> · {status.webhook ? tr("ลงทะเบียนแล้ว ({0})", [status.webhook]) : tr("ยังไม่ได้ลงทะเบียน")} ·{" "}
          {status.webhookSecret ? tr("มี secret บนเว็บแล้ว") : tr("ยังไม่มี secret บนเว็บ")}
        </p>
        {!(status.webhook && status.webhookSecret) && <p className="text-sm text-warning">{tr("ยังรับแจ้งผลไม่ได้ — การเปลี่ยนที่นั่งหรือยกเลิกจะไม่อัปเดตในระบบ")}</p>}
        <BillingWebhookForm envName={live ? "STRIPE_LIVE_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET"} exists={Boolean(status.webhook)} />
      </div>
    </div>
  );
}
