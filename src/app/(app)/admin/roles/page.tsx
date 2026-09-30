import { deleteRole } from "@/app/actions/admin";
import { prisma } from "@/lib/db";
import { LEVEL, levelLabel } from "@/lib/permissions";
import { RoleForm } from "../forms";

export default async function RolesPage() {
  const roles = await prisma.role.findMany({
    orderBy: [{ level: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="card text-sm text-slate-600">
        <p className="mb-2 font-medium text-slate-800">Level กำหนดสิทธิ์ระดับระบบ</p>
        <ul className="grid gap-1 sm:grid-cols-3">
          <li><b>≥ {LEVEL.MEMBER}</b> Member — ส่ง daily scrum ของตัวเอง</li>
          <li><b>≥ {LEVEL.MANAGER}</b> Manager — ดูภาพรวมทุกทีม</li>
          <li><b>≥ {LEVEL.ADMIN}</b> Admin — จัดการผู้ใช้ / role / ทีม</li>
        </ul>
        <p className="mt-2">
          หัวหน้าทีมกำหนดรายทีมที่เมนู <b>ผู้ใช้</b> (ติ๊ก ★ หัวหน้า) — เห็นภาพรวมทีมนั้นและทีมย่อยทั้งหมด
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">เพิ่ม role</h2>
        <RoleForm />
      </div>

      {roles.map((role) => (
        <details key={role.id} className="card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>
              <span className="font-medium">{role.name}</span>
              <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                Lv {role.level} · {levelLabel(role.level)}
              </span>
              {role.description && <span className="ml-2 text-sm text-slate-500">{role.description}</span>}
            </span>
            <span className="text-sm text-slate-500">{role._count.users} คน · แก้ไข ▾</span>
          </summary>
          <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
            <RoleForm role={role} />
            {role._count.users === 0 && (
              <form action={deleteRole}>
                <input type="hidden" name="id" value={role.id} />
                <button className="text-sm text-red-600 hover:underline">ลบ role นี้</button>
              </form>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
