import { prisma } from "@/lib/db";
import { UserForm } from "../forms";

export default async function UsersPage() {
  const [users, roles, teams] = await Promise.all([
    prisma.user.findMany({
      omit: { passwordHash: true },
      include: { role: true, team: true },
      orderBy: [{ active: "desc" }, { role: { level: "desc" } }, { name: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { level: "desc" } }),
    prisma.team.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="mb-3 font-semibold">เพิ่มผู้ใช้</h2>
        <UserForm roles={roles} teams={teams} />
      </div>
      {users.map((user) => (
        <details key={user.id} className="card">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className={user.active ? "" : "opacity-50"}>
              <span className="font-medium">{user.name}</span>
              <span className="ml-2 text-sm text-slate-500">{user.email}</span>
              {!user.active && <span className="ml-2 text-xs text-red-600">(ปิดใช้งาน)</span>}
            </span>
            <span className="text-sm text-slate-500">
              {user.role.name} · Lv {user.role.level} · {user.team?.name ?? "ไม่มีทีม"} · แก้ไข ▾
            </span>
          </summary>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <UserForm
              user={{ id: user.id, name: user.name, email: user.email, roleId: user.roleId, teamId: user.teamId, active: user.active }}
              roles={roles}
              teams={teams}
            />
          </div>
        </details>
      ))}
    </div>
  );
}
