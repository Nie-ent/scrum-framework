"use client";

import { useActionState } from "react";
import { grantPlan, saveRole, saveTeam, saveUser } from "@/app/actions/admin";
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
