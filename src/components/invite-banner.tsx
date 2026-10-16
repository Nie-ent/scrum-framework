import { respondToInvite } from "@/app/actions/teams";
import { ACCESS_LABEL } from "@/lib/permissions";
import { tr } from "@/lib/i18n/server";
import type { TeamAccess } from "@prisma/client";

export type PendingInvite = { id: string; teamName: string; inviter: string | null; access: TeamAccess };

/** คำเชิญเข้าทีมที่รอคุณ — แสดงบนทุกหน้า กดรับ/ปฏิเสธได้ทันทีโดยไม่ต้องไปหน้าทีม (เฉพาะบัญชีที่ยืนยันอีเมลแล้ว) */
export function InviteBanner({ invites }: { invites: PendingInvite[] }) {
  if (invites.length === 0) return null;
  return (
    <section aria-label={tr("คำเชิญที่รอคุณ")} className="mb-5 space-y-2">
      {invites.map((i) => (
        <div key={i.id} role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-primary-soft px-4 py-3">
          <p className="min-w-0 flex-1 basis-56 text-sm text-foreground">
            <span className="font-semibold">{i.inviter ? tr("{0} เชิญคุณเข้าทีม {1}", [i.inviter, i.teamName]) : tr("คุณได้รับเชิญเข้าทีม {0}", [i.teamName])}</span>
            <span className="text-muted-foreground"> · {tr("เป็น")}{tr(ACCESS_LABEL[i.access])}</span>
          </p>
          <form action={respondToInvite} className="flex shrink-0 gap-2">
            <input type="hidden" name="id" value={i.id} />
            <button className="btn min-h-9 px-3 py-1 text-sm">{tr("รับคำเชิญ")}</button>
            <button name="decline" value="1" className="btn-ghost min-h-9 px-3 py-1 text-sm">{tr("ปฏิเสธ")}</button>
          </form>
        </div>
      ))}
    </section>
  );
}
