import { prisma } from "@/lib/db";
import { teamsLabel } from "@/lib/permissions";
import { sortTeamTree } from "@/lib/teams";
import { UserForm } from "../forms";

export default async function UsersPage() {
  const [users, roles, teams] = await Promise.all([
    prisma.user.findMany({
      omit: { passwordHash: true },
      include: { role: true, memberships: { include: { team: true }, orderBy: { team: { name: "asc" } } } },
      orderBy: [{ active: "desc" }, { role: { level: "desc" } }, { name: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { level: "desc" } }),
    prisma.team.findMany({ select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } }),
  ]);
  const teamTree = sortTeamTree(teams);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">New member</p><h2 className="font-semibold text-slate-900">เพิ่มผู้ใช้</h2></div><span className="badge badge-neutral">{users.length} คน</span></div>
        <UserForm roles={roles} teams={teamTree} />
      </div>
      {users.map((user) => (
        <details key={user.id} className="card group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
            <span className={user.active ? "" : "opacity-50"}>
              <span className="font-medium">{user.name}</span>
              <span className="ml-2 text-sm text-slate-500">{user.email}</span>
              {!user.active && <span className="badge badge-danger ml-2">ปิดใช้งาน</span>}
            </span>
            <span className="text-sm text-slate-500">
              {user.role.name} · Lv {user.role.level} · {teamsLabel(user.memberships)} <span className="ml-1 text-indigo-600">แก้ไข</span>
            </span>
          </summary>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <UserForm
              user={{
                id: user.id,
                name: user.name,
                email: user.email,
                roleId: user.roleId,
                active: user.active,
                memberships: user.memberships.map((m) => ({ teamId: m.teamId, isLead: m.isLead })),
              }}
              roles={roles}
              teams={teamTree}
            />
          </div>
        </details>
      ))}
    </div>
  );
}
