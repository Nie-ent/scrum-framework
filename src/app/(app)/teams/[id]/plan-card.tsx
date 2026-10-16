import Link from "next/link";
import type { PlanState } from "@/lib/plans";
import { formatDateKey } from "@/lib/format-dates";
import { dateToKey } from "@/lib/dates";
import { tr } from "@/lib/i18n/server";
import { isBillingConfigured, teamPrices } from "@/lib/billing";
import { BillingButtons } from "./billing-buttons";

/** แพ็กเกจของ workspace: ที่นั่งที่ใช้ / ทั้งหมด และปุ่มอัปเกรด/จัดการการชำระเงิน (เฉพาะเจ้าของทีมระดับบน) */
export async function PlanCard({ teamId, parentName, owner, state, freeSeats, used, pending, notice }: { teamId: string; parentName: string | null; owner: boolean; state: PlanState; freeSeats: number; used: number; pending: number; notice?: "success" | "cancel" }) {
  const taken = used + pending;
  const manage = owner && !parentName && isBillingConfigured();
  const paid = state.source === "paid";
  // ราคาจาก Stripe — ดึงไม่ได้ก็ยังแสดงการ์ดได้ (แค่ไม่มีปุ่มอัปเกรด)
  const prices = manage && !paid ? await teamPrices().catch(() => []) : [];
  const full = taken >= state.seats;
  const percent = Math.min(100, Math.round((taken / Math.max(1, state.seats)) * 100));
  const date = (d: Date | null) => (d ? formatDateKey(dateToKey(d)) : "");
  return (
    <section className="card" aria-labelledby="plan-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{tr("แพ็กเกจ")}</p>
          <h2 id="plan-title" className="font-semibold text-foreground">
            {state.plan === "FREE" ? tr("ฟรี") : tr("ทีม")}
            {state.source === "comp" && <span className="ml-2 badge badge-neutral">{tr("ผู้ดูแลระบบให้ใช้ถึง {0}", [date(state.compUntil)])}</span>}
            {state.pastDue && <span className="ml-2 badge badge-danger">{tr("ชำระเงินไม่สำเร็จ")}</span>}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {parentName ? tr("ทีมย่อยใช้แพ็กเกจและที่นั่งร่วมกับ {0}", [parentName]) : state.plan === "FREE" ? tr("ใช้ฟรีได้ไม่เกิน {0} คนรวมทุกทีมย่อย · พื้นที่ส่วนตัวฟรีเสมอ", [freeSeats]) : state.source === "paid" && state.currentPeriodEnd ? (state.cancelAtPeriodEnd ? tr("ยกเลิกแล้ว ใช้ได้ถึง {0} จากนั้นกลับเป็นแพ็กเกจฟรี", [date(state.currentPeriodEnd)]) : tr("ต่ออายุอัตโนมัติ {0}", [date(state.currentPeriodEnd)])) : ""}
          </p>
        </div>
        {owner && !parentName && !isBillingConfigured() && <span className="text-xs text-subtle">{tr("ยังไม่เปิดระบบชำระเงิน")}</span>}
        {manage && paid && <BillingButtons teamId={teamId} paid minimum={taken} suggested={taken} prices={[]} />}
        {parentName && owner && <Link href={`/teams/${teamId}`} className="btn-ghost">{tr("ไปที่ทีมแม่")}</Link>}
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-foreground">{tr("ใช้ {0} จาก {1} ที่นั่ง", [taken, state.seats])}</span>
          {pending > 0 && <span className="text-xs text-muted-foreground">{tr("รวมคำเชิญที่รอรับ {0}", [pending])}</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
          <div className={`h-full rounded-full ${full ? "bg-warning" : "bg-primary"}`} style={{ width: `${percent}%` }} />
        </div>
        {full && <p className="mt-2 text-sm text-warning">{owner && !parentName ? tr("ที่นั่งเต็มแล้ว — เพิ่มที่นั่งเพื่อเชิญคนเพิ่ม") : tr("ที่นั่งเต็มแล้ว — ขอให้เจ้าของทีมเพิ่มที่นั่ง")}</p>}
      </div>
      {notice === "success" && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{paid ? tr("ชำระเงินสำเร็จ — เปิดใช้แพ็กเกจทีมแล้ว") : tr("ได้รับการชำระเงินแล้ว — ระบบกำลังเปิดแพ็กเกจ รีเฟรชหน้านี้อีกครั้งในอีกสักครู่")}</p>}
      {notice === "cancel" && <p role="status" className="mt-3 text-sm text-muted-foreground">{tr("ยกเลิกการชำระเงินแล้ว ยังไม่มีการตัดเงิน")}</p>}
      {manage && !paid && <BillingButtons teamId={teamId} paid={false} minimum={Math.max(1, taken)} suggested={Math.max(taken + 1, freeSeats + 1)} prices={prices.map(({ interval, amount, currency }) => ({ interval, amount, currency }))} />}
    </section>
  );
}
