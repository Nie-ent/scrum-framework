"use client";

import { useActionState, useState } from "react";
import { openBillingPortal, startCheckout } from "@/app/actions/billing";
import { FormMessage, SubmitButton } from "@/components/form";
import { useT } from "@/components/i18n";

type Price = { interval: "month" | "year"; amount: number; currency: string };

/** เจ้าของทีม: สมัครแพ็กเกจทีม (เลือกรายเดือน/รายปี + จำนวนที่นั่ง) หรือเปิดหน้าจัดการการชำระเงินของ Stripe */
export function BillingButtons({ teamId, paid, minimum, suggested, prices }: { teamId: string; paid: boolean; minimum: number; suggested: number; prices: Price[] }) {
  const tr = useT();
  const [checkoutState, checkout] = useActionState(startCheckout, undefined);
  const [portalState, portal] = useActionState(openBillingPortal, undefined);
  const [interval, setBillingInterval] = useState<Price["interval"]>("month");
  const [seats, setSeats] = useState(Math.max(minimum, suggested));

  if (paid) {
    return (
      <form action={portal} className="space-y-2">
        <input type="hidden" name="teamId" value={teamId} />
        <SubmitButton className="btn-ghost" pendingText={tr("กำลังเปิด...")}>{tr("จัดการการชำระเงิน")}</SubmitButton>
        <FormMessage state={portalState} />
      </form>
    );
  }
  if (prices.length === 0) return null;
  const price = prices.find((p) => p.interval === interval) ?? prices[0];
  const money = (n: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency.toUpperCase(), currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(n);
  const count = Number.isFinite(seats) && seats > 0 ? seats : minimum;

  return (
    <form action={checkout} className="mt-4 space-y-3 rounded-2xl bg-surface-sunken p-4">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="interval" value={price.interval} />
      <p className="text-sm font-semibold text-foreground">{tr("อัปเกรดเป็นแพ็กเกจทีม")}</p>
      <div className="flex flex-wrap items-end gap-3">
        {prices.length > 1 && (
          <div className="inline-flex rounded-full bg-surface p-1 text-sm" role="group" aria-label={tr("รอบการชำระเงิน")}>
            {(["month", "year"] as const).filter((i) => prices.some((p) => p.interval === i)).map((i) => (
              <button key={i} type="button" aria-pressed={i === price.interval} onClick={() => setBillingInterval(i)} className={`inline-flex min-h-9 items-center rounded-full px-4 transition ${i === price.interval ? "bg-surface-sunken font-semibold text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                {i === "month" ? tr("รายเดือน") : tr("รายปี")}
              </button>
            ))}
          </div>
        )}
        <label className="text-sm text-muted-foreground">
          <span className="mb-1 block">{tr("จำนวนที่นั่ง")}</span>
          <input name="seats" type="number" inputMode="numeric" min={minimum} max={1000} value={Number.isFinite(seats) ? seats : ""} onChange={(e) => setSeats(e.target.valueAsNumber)} className="input w-28" />
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        {price.interval === "month" ? tr("{0} ต่อที่นั่งต่อเดือน · รวม {1}", [money(price.amount), money(price.amount * count)]) : tr("{0} ต่อที่นั่งต่อปี · รวม {1}", [money(price.amount), money(price.amount * count)])}
      </p>
      <SubmitButton pendingText={tr("กำลังไปหน้าชำระเงิน...")}>{tr("ไปหน้าชำระเงิน")}</SubmitButton>
      <FormMessage state={checkoutState} />
    </form>
  );
}
