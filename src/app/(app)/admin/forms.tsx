"use client";

import { useActionState } from "react";
import { saveRole, saveTeam, saveUser } from "@/app/actions/admin";
import { FormMessage, SubmitButton } from "@/components/form";

type Option = { id: string; name: string };

export function RoleForm({ role }: { role?: { id: string; name: string; level: number; description: string | null } }) {
  const [state, action] = useActionState(saveRole, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_120px_2fr_auto] sm:items-end">
      {role && <input type="hidden" name="id" value={role.id} />}
      <div>
        <label className="label">ชื่อ role</label>
        <input className="input" name="name" defaultValue={role?.name} required />
      </div>
      <div>
        <label className="label">Level</label>
        <input className="input" name="level" type="number" min={1} defaultValue={role?.level ?? 10} required />
      </div>
      <div>
        <label className="label">คำอธิบาย</label>
        <input className="input" name="description" defaultValue={role?.description ?? ""} />
      </div>
      <SubmitButton>{role ? "บันทึก" : "เพิ่ม role"}</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function TeamForm({ team }: { team?: Option }) {
  const [state, action] = useActionState(saveTeam, undefined);
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      {team && <input type="hidden" name="id" value={team.id} />}
      <input className="input max-w-xs" name="name" defaultValue={team?.name} placeholder="ชื่อทีม" required />
      <SubmitButton className={team ? "btn-ghost" : "btn"}>{team ? "เปลี่ยนชื่อ" : "เพิ่มทีม"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

type UserValue = {
  id: string;
  name: string;
  email: string;
  roleId: string;
  teamId: string | null;
  active: boolean;
};

export function UserForm({
  user,
  roles,
  teams,
}: {
  user?: UserValue;
  roles: (Option & { level: number })[];
  teams: Option[];
}) {
  const [state, action] = useActionState(saveUser, undefined);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-3">
      {user && <input type="hidden" name="id" value={user.id} />}
      <div>
        <label className="label">ชื่อ</label>
        <input className="input" name="name" defaultValue={user?.name} required />
      </div>
      <div>
        <label className="label">อีเมล</label>
        <input className="input" name="email" type="email" defaultValue={user?.email} required />
      </div>
      <div>
        <label className="label">{user ? "รีเซ็ตรหัสผ่าน (เว้นว่าง = ไม่เปลี่ยน)" : "รหัสผ่านเริ่มต้น"}</label>
        <input className="input" name="password" type="password" minLength={8} required={!user} autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Role</label>
        <select className="input" name="roleId" defaultValue={user?.roleId ?? ""} required>
          <option value="" disabled>เลือก role</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name} (Lv {r.level})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">ทีม</label>
        <select className="input" name="teamId" defaultValue={user?.teamId ?? ""}>
          <option value="">— ไม่มีทีม —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-end justify-between gap-3">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={user?.active ?? true} /> ใช้งานอยู่
        </label>
        <SubmitButton>{user ? "บันทึก" : "เพิ่มผู้ใช้"}</SubmitButton>
      </div>
      <div className="md:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}
