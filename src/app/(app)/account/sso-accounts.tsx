import { unlinkIdentity } from "@/app/actions/sso";
import { ProviderGlyph, SSO_MESSAGES } from "@/components/sso-buttons";
import { tr } from "@/lib/i18n/server";
import type { ProviderId } from "@/lib/sso";

/** บัญชี Google / Microsoft ที่ผูกไว้สำหรับเข้าสู่ระบบ — เชื่อมเพิ่มหรือยกเลิกได้ */
export function SsoAccounts({ providers, linked, notice }: { providers: { id: ProviderId; label: string }[]; linked: { provider: string; email: string }[]; notice?: string }) {
  if (providers.length === 0 && linked.length === 0) return null;
  const message = notice ? SSO_MESSAGES[notice] : undefined;
  return (
    <section className="card space-y-3" id="sso">
      <div>
        <h2 className="font-semibold text-slate-900">{tr("เข้าสู่ระบบด้วยบัญชีอื่น")}</h2>
        <p className="text-sm text-slate-500">{tr("เชื่อมบัญชี Google หรือ Microsoft เพื่อเข้าสู่ระบบได้โดยไม่ต้องพิมพ์รหัสผ่าน")}</p>
      </div>
      {message && <p role="status" className={`rounded-xl px-3 py-2 text-sm font-medium ${notice === "linked" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{tr(message)}</p>}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {providers.map((p) => {
          const row = linked.find((l) => l.provider === p.id);
          return (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <ProviderGlyph id={p.id} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{p.label}</p>
                  <p className="truncate text-xs text-slate-500">{row ? row.email : tr("ยังไม่ได้เชื่อม")}</p>
                </div>
              </div>
              {row ? (
                <form action={unlinkIdentity} className="shrink-0">
                  <input type="hidden" name="provider" value={p.id} />
                  <button className="whitespace-nowrap rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:text-rose-600">{tr("ยกเลิกการเชื่อม")}</button>
                </form>
              ) : (
                <a href={`/api/auth/${p.id}/start?link=1`} className="btn-ghost min-h-9 shrink-0 px-3 py-1 text-xs">{tr("เชื่อม")}</a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">{tr("ถ้าสมัครด้วยบัญชีเหล่านี้และยังไม่เคยตั้งรหัสผ่าน ให้ตั้งรหัสผ่านด้วย \"ลืมรหัสผ่าน\" ก่อนยกเลิกการเชื่อม")}</p>
    </section>
  );
}
