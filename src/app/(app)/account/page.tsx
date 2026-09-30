import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">บัญชีของฉัน</h1>
      <div className="card text-sm">
        <div className="font-medium">{user.name}</div>
        <div className="text-slate-500">{user.email}</div>
        <div className="mt-2 text-slate-500">
          {user.role.name} · Lv {user.role.level} · {user.team?.name ?? "ไม่มีทีม"}
        </div>
      </div>
      <PasswordForm />
    </div>
  );
}
