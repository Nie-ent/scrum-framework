import { deleteRole } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { LEVEL, levelLabel } from "@/lib/permissions";
import { RoleForm } from "../forms";
import { tr } from "@/lib/i18n/server";

export default async function RolesPage() {
  const roles = await prisma.role.findMany({
    orderBy: [{ level: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="card text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">{tr("Level กำหนดสิทธิ์ระดับระบบ")}</p>
        <ul className="grid gap-1 sm:grid-cols-2">
          <li><b>≥ {LEVEL.MEMBER}</b> {tr("Member — ผู้ใช้ทั่วไป")}</li>
          <li><b>≥ {LEVEL.ADMIN}</b> {tr("Admin — จัดการผู้ใช้ / role / ทีม ทั้งระบบ")}</li>
        </ul>
        <p className="mt-2">
          {tr("การเห็นภาพรวมและมอบหมายงานกำหนด")}{" "}<b>{tr("รายทีม")}</b> {tr("ที่เมนู")}{" "}<b>{tr("ผู้ใช้")}</b> {tr("(ติ๊ก ★ หัวหน้า) — เห็นทีมนั้นและทีมย่อย · ชื่อ role ใช้เป็นชื่อบทบาทตั้งต้นของคนนั้นในทีม")}
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">{tr("เพิ่ม role")}</h2>
        <RoleForm />
      </div>

      {roles.map((role) => (
        <details key={role.id} className="card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>
              <span className="font-medium">{role.name}</span>
              <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                Lv {role.level} · {levelLabel(role.level)}
              </span>
              {role.description && <span className="ml-2 text-sm text-slate-500">{role.description}</span>}
            </span>
            <span className="text-sm text-slate-500">{role._count.users} {tr("คน · แก้ไข ▾")}</span>
          </summary>
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <RoleForm role={role} />
            {role._count.users === 0 && (
              <form action={deleteRole}>
                <input type="hidden" name="id" value={role.id} />
                <button className="text-sm text-red-600 hover:underline">{tr("ลบ role นี้")}</button>
              </form>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
