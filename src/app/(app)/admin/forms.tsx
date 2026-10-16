"use client";

import { useActionState, useState } from "react";
import { grantPlan, savePlanSettings, saveRole, saveTeam, saveTeamPrices, saveUser, setupBillingCatalog, setupBillingWebhook } from "@/app/actions/admin";
import { DatePicker } from "@/components/date-picker";
import { FormMessage, SubmitButton } from "@/components/form";
import { Select } from "@/components/select";
import { useT } from "@/components/i18n";

type Option = { id: string; name: string };

export function RoleForm({ role }: { role?: { id: string; name: string; level: number; description: string | null } }) {
  const tr = useT();
  const [state, action] = useActionState(saveRole, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_120px_2fr_auto] sm:items-end">
      {role && <input type="hidden" name="id" value={role.id} />}
      <div>
        <label className="label">{tr("ชื่อ role")}</label>
        <input className="input" name="name" defaultValue={role?.name} required />
      </div>
      <div>
        <label className="label">Level</label>
        <input className="input" name="level" type="number" min={1} defaultValue={role?.level ?? 10} required />
      </div>
      <div>
        <label className="label">{tr("คำอธิบาย")}</label>
        <input className="input" name="description" defaultValue={role?.description ?? ""} />
      </div>
      <SubmitButton>{role ? tr("บันทึก") : tr("เพิ่ม role")}</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function TeamForm({
  team,
  parents,
  hasChildren = false,
}: {
  team?: Option & { parentId: string | null };
  parents: Option[];
  hasChildren?: boolean;
}) {
  const tr = useT();
  const [state, action] = useActionState(saveTeam, undefined);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      {team && <input type="hidden" name="id" value={team.id} />}
      <input className="input max-w-xs" name="name" defaultValue={team?.name} placeholder={tr("ชื่อทีม")} required />
      <Select
        className="w-56"
        name="parentId"
        aria-label={tr("ระดับของทีม")}
        defaultValue={team?.parentId ?? ""}
        disabled={hasChildren}
        title={hasChildren ? tr("ทีมที่มีทีมย่อยต้องเป็นทีมระดับบน") : undefined}
        options={[{ value: "", label: tr("ทีมระดับบน") }, ...parents.filter((p) => p.id !== team?.id).map((p) => ({ value: p.id, label: tr("ทีมย่อยของ {0}", [p.name]) }))]}
      />
      <SubmitButton className={team ? "btn-ghost" : "btn"}>{team ? tr("บันทึก") : tr("เพิ่มทีม")}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

/** ให้แพ็กเกจทีมฟรีถึงวันที่กำหนด (ลูกค้าทดลอง / พาร์ตเนอร์) */
export function GrantPlanForm({ teamId, seats, until, today }: { teamId: string; seats: number | null; until: string; today: string }) {
  const tr = useT();
  const [state, action] = useActionState(grantPlan, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input className="input w-24" name="seats" type="number" min={0} defaultValue={seats ?? ""} placeholder={tr("ที่นั่ง")} aria-label={tr("จำนวนที่นั่งที่ให้")} />
      <DatePicker name="until" defaultValue={until} today={today} min={today} size="sm" className="w-44" aria-label={tr("ให้ใช้ถึงวันที่")} />
      <SubmitButton className="btn-ghost">{tr("ให้แพ็กเกจ")}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

type TeamOption = Option & { parentId: string | null };

type UserValue = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  active: boolean;
  memberships: { teamId: string; lead: boolean }[];
};

export function UserForm({
  user,
  roles,
  teams,
}: {
  user?: UserValue;
  roles: (Option & { level: number })[];
  /** เรียงแบบต้นไม้แล้ว (ทีมใหญ่ → ทีมย่อย) */
  teams: TeamOption[];
}) {
  const tr = useT();
  const [state, action] = useActionState(saveUser, undefined);
  const member = new Map(user?.memberships.map((m) => [m.teamId, m.lead]));
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div>
        <label className="label">{tr("ชื่อ")}</label>
        <input className="input" name="name" defaultValue={user?.name} required />
      </div>
      <div>
        <label className="label">{tr("อีเมล")}</label>
        <input className="input" name="email" type="email" defaultValue={user?.email} required />
      </div>
      <div>
        <label className="label">{user ? tr("รีเซ็ตรหัสผ่าน (เว้นว่าง = ไม่เปลี่ยน)") : tr("รหัสผ่านเริ่มต้น")}</label>
        <input className="input" name="password" type="password" minLength={8} required={!user} autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Role</label>
        <Select name="roleId" aria-label="Role" placeholder={tr("เลือก role")} defaultValue={user?.roleId ?? ""} options={roles.map((r) => ({ value: r.id, label: `${r.name} (Lv ${r.level})` }))} />
      </div>
      <div className="flex items-end gap-3 md:col-span-2">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={user?.active ?? true} /> {tr("ใช้งานอยู่")}
        </label>
      </div>
      <fieldset className="md:col-span-3">
        <legend className="label">{tr("ทีม")}{" "}<span className="font-normal text-slate-400">{tr("(เลือกได้หลายทีม · ★ = หัวหน้าทีม เห็นภาพรวมทีมนั้นและทีมย่อย)")}</span></legend>
        {teams.length === 0 ? (
          <p className="text-sm text-slate-400">{tr("ยังไม่มีทีม — สร้างได้ที่เมนู ทีม")}</p>
        ) : (
          <div className="grid gap-1 rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {teams.map((t) => (
              <div key={t.id} className={`flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-slate-50 ${t.parentId ? "pl-6" : ""}`}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="teams" value={t.id} defaultChecked={member.has(t.id)} />
                  {t.parentId && <span className="text-slate-400">└</span>}
                  {t.name}
                </label>
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input type="checkbox" name="leads" value={t.id} defaultChecked={member.get(t.id) === true} /> {tr("★ หัวหน้า")}
                </label>
              </div>
            ))}
          </div>
        )}
      </fieldset>
      <div className="md:col-span-3 flex items-center justify-between gap-3">
        <FormMessage state={state} />
        <SubmitButton>{user ? tr("บันทึก") : tr("เพิ่มผู้ใช้")}</SubmitButton>
      </div>
    </form>
  );
}

/** หน้า admin → ชำระเงิน: ปุ่มตั้งค่าสินค้า/ราคา และสร้าง webhook (แสดง secret ครั้งเดียว) */
/** จำนวนที่นั่งของแพ็กเกจฟรี + เปิด/ปิดการสมัครเอง */
export function PlanSettingsForm({ freeSeats, allowSignup }: { freeSeats: number; allowSignup: boolean }) {
  const tr = useT();
  const [state, action] = useActionState(savePlanSettings, undefined);
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="label" htmlFor="freeSeats">{tr("แพ็กเกจฟรีใช้ได้กี่คนต่อ workspace")}</label>
        <input id="freeSeats" className="input w-28" name="freeSeats" type="number" min={0} max={10000} defaultValue={freeSeats} required />
        <p className="mt-1 text-xs text-muted-foreground">{tr("ลดจำนวนลงจะไม่เอาใครออก แค่เพิ่มคนใหม่ไม่ได้จนกว่าจะต่ำกว่าโควตา · ทีมที่จ่ายเงินได้อย่างน้อยเท่านี้เสมอ")}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="allowSignup" defaultChecked={allowSignup} /> {tr("ใครก็สมัครเองได้ (ปิด = สมัครได้เฉพาะคนที่มีลิงก์คำเชิญ)")}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{tr("บันทึก")}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** ราคาต่อที่นั่ง (บาท) ใน Stripe */
export function TeamPriceForm({ month, year }: { month: number; year: number }) {
  const tr = useT();
  const [state, action] = useActionState(saveTeamPrices, undefined);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="price-month">{tr("รายเดือน (บาท/ที่นั่ง)")}</label>
          <input id="price-month" className="input w-32" name="month" type="number" min={1} step={1} defaultValue={month} required />
        </div>
        <div>
          <label className="label" htmlFor="price-year">{tr("รายปี (บาท/ที่นั่ง)")}</label>
          <input id="price-year" className="input w-32" name="year" type="number" min={1} step={1} defaultValue={year} required />
        </div>
        <SubmitButton className="btn-ghost" pendingText={tr("กำลังบันทึก...")}>{tr("เปลี่ยนราคา")}</SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">{tr("ลูกค้าใหม่จ่ายราคาใหม่ทันที ลูกค้าเดิมยังจ่ายราคาเดิม")}</p>
      <FormMessage state={state} />
    </form>
  );
}

export function BillingCatalogForm({ live, ready }: { live: boolean; ready: boolean }) {
  const tr = useT();
  const [state, action] = useActionState(setupBillingCatalog, undefined);
  return (
    <form action={action} className="space-y-2">
      {live && !ready && <p className="text-sm text-warning">{tr("กดแล้วเจ้าของทีมทุกคนจะเห็นปุ่มอัปเกรด และจ่ายเงินจริงได้ทันที")}</p>}
      <SubmitButton className={ready ? "btn-ghost" : "btn"} pendingText={tr("กำลังตั้งค่า...")}>{ready ? tr("อัปเดตหน้าจัดการการชำระเงิน") : tr("สร้างสินค้าและราคา")}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

export function BillingWebhookForm({ envName, exists }: { envName: string; exists: boolean }) {
  const tr = useT();
  const [state, action] = useActionState(setupBillingWebhook, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-2">
      {exists && <p className="text-sm text-muted-foreground">{tr("สร้างใหม่จะลบ webhook เดิมของเว็บนี้ใน Stripe และต้องใส่ secret ใหม่บน Vercel")}</p>}
      <SubmitButton className={exists ? "btn-ghost" : "btn"} pendingText={tr("กำลังสร้าง...")}>{exists ? tr("สร้าง webhook ใหม่") : tr("สร้าง webhook")}</SubmitButton>
      {state?.secret ? (
        <div role="status" className="space-y-2 rounded-xl bg-surface-sunken p-3 text-sm">
          <p className="text-foreground">{tr("คัดลอก secret นี้ไปใส่บน Vercel ชื่อ {0} (Production, ติ๊ก Sensitive) แล้ว redeploy — secret นี้แสดงครั้งเดียว", [envName])}</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-2 text-xs">{state.secret}</code>
            <button type="button" className="btn-ghost shrink-0" onClick={async () => { await navigator.clipboard.writeText(state.secret!); setCopied(true); }}>
              {copied ? tr("คัดลอกแล้ว ✓") : tr("คัดลอก")}
            </button>
          </div>
        </div>
      ) : (
        <FormMessage state={state} />
      )}
    </form>
  );
}
