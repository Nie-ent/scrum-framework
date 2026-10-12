import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { decideOAuth } from "@/app/actions/oauth";
import { requireUser } from "@/lib/auth";
import { checkAuthorize } from "@/lib/oauth";
import { AuthShell } from "@/components/auth-shell";
import { ensureLang, tr } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  await ensureLang();
  return { title: tr("อนุญาตการเชื่อมต่อ") };
}

/** หน้ายินยอมของ OAuth: โปรแกรม (เช่น Claude) ขอเข้าถึง Pace ในนามผู้ใช้ที่ล็อกอินอยู่ */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const user = await requireUser();
  const checked = await checkAuthorize(await searchParams);
  if (!checked.ok) {
    if ("redirect" in checked && checked.redirect) redirect(checked.redirect);
    return (
      <AuthShell>
        <div className="card space-y-2">
          <h2 className="text-xl font-semibold text-slate-950">{tr("เชื่อมต่อไม่ได้")}</h2>
          <p className="text-sm text-slate-600">{tr("error" in checked && checked.error ? checked.error : "คำขอไม่ถูกต้อง")}</p>
        </div>
      </AuthShell>
    );
  }
  const { client, params } = checked;
  const host = new URL(params.redirect_uri).host;
  return (
    <AuthShell>
      <form action={decideOAuth} className="card space-y-5">
        {Object.entries(params).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <div>
          <p className="eyebrow">{tr("เชื่อมต่อผู้ช่วย AI")}</p>
          <h2 className="text-xl font-semibold text-slate-950">{tr("อนุญาตให้ {0} เข้าถึง Pace?", [client.name])}</h2>
          <p className="mt-1 text-sm text-slate-500">{tr("คุณกำลังเข้าสู่ระบบเป็น {0}", [user.email])} · {tr("จะส่งกลับไปที่ {0}", [host])}</p>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-slate-600">
          <li>{tr("ดูงาน โน้ต และเช็กอินในทีมและพื้นที่ส่วนตัวของคุณ")}</li>
          <li>{tr("สร้างและแก้ไขงานกับโน้ตในนามคุณ")}</li>
          <li>{tr("ทำได้เท่าที่บัญชีของคุณทำได้ และยกเลิกได้ทุกเมื่อที่หน้า บัญชี")}</li>
        </ul>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="readOnly" />
          {tr("อ่านอย่างเดียว — ผู้ช่วยดูข้อมูลได้ แต่สร้างหรือแก้ไขไม่ได้")}
        </label>
        <div className="flex gap-2">
          <button name="decision" value="deny" className="btn-ghost flex-1">{tr("ไม่อนุญาต")}</button>
          <button name="decision" value="allow" className="btn flex-1">{tr("อนุญาต")}</button>
        </div>
        <p className="text-xs text-slate-500">{tr("อนุญาตเฉพาะเมื่อคุณเป็นคนเริ่มการเชื่อมต่อนี้เองจากโปรแกรมที่ไว้ใจ")}</p>
      </form>
    </AuthShell>
  );
}
