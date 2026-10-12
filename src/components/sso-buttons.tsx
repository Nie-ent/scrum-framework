import { ssoProviders, type ProviderId } from "@/lib/sso";
import { tr } from "@/lib/i18n/server";

export function ProviderGlyph({ id }: { id: ProviderId }) {
  return id === "google" ? (
    <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.300H12v4.400h6.500a5.600 5.600 0 0 1-2.400 3.600v3h3.900c2.300-2.100 3.500-5.200 3.500-8.700z" />
      <path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.7-2.500 1.200-4.100 1.200-3.100 0-5.800-2.100-6.700-5H1.300v3.100A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600H1.300a12 12 0 0 0 0 10.800l4-3.100z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800l3.400-3.400A12 12 0 0 0 1.300 6.600l4 3.100c.9-2.900 3.600-4.900 6.700-4.900z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="size-[1.125rem] shrink-0" aria-hidden="true">
      <path fill="#F25022" d="M2 2h9.500v9.500H2z" />
      <path fill="#7FBA00" d="M12.500 2H22v9.500h-9.500z" />
      <path fill="#00A4EF" d="M2 12.500h9.500V22H2z" />
      <path fill="#FFB900" d="M12.500 12.500H22V22h-9.500z" />
    </svg>
  );
}

/** ข้อความเมื่อเข้าสู่ระบบด้วยผู้ให้บริการไม่สำเร็จ (?sso=…) */
export const SSO_MESSAGES: Record<string, string> = {
  cancelled: "ยกเลิกการเข้าสู่ระบบแล้ว",
  expired: "การเข้าสู่ระบบหมดเวลา กรุณาลองใหม่",
  failed: "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่",
  unavailable: "ยังไม่ได้เปิดใช้การเข้าสู่ระบบด้วยผู้ให้บริการนี้",
  busy: "ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่",
  inactive: "บัญชีนี้ถูกปิดใช้งาน",
  no_account: "ยังไม่มีบัญชี Pace สำหรับอีเมลนี้ — ต้องมีลิงก์คำเชิญจากทีมก่อน",
  link_required: "มีบัญชี Pace ที่ใช้อีเมลนี้อยู่แล้ว — เข้าสู่ระบบด้วยรหัสผ่านก่อน แล้วเชื่อมบัญชีนี้ที่หน้า บัญชี",
  linked: "เชื่อมบัญชีแล้ว",
  taken: "บัญชีนี้เชื่อมอยู่กับผู้ใช้ Pace คนอื่นแล้ว",
  already: "คุณเชื่อมบัญชีของผู้ให้บริการนี้ไว้แล้ว — ยกเลิกอันเดิมก่อนถ้าต้องการเปลี่ยน",
};

/** ปุ่มเข้าสู่ระบบด้วย Google / Microsoft — แสดงเฉพาะผู้ให้บริการที่ตั้งค่าไว้ (ไม่มีเลย = ไม่แสดงอะไร) */
export function SsoButtons({ next, error }: { next?: string; error?: string }) {
  const providers = ssoProviders();
  const message = error ? SSO_MESSAGES[error] : undefined;
  if (providers.length === 0 && !message) return null;
  return (
    <div className="mt-4 space-y-3">
      {message && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{tr(message)}</p>}
      {providers.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" />{tr("หรือ")}<span className="h-px flex-1 bg-slate-200" /></div>
          <div className="grid gap-2">
            {providers.map((p) => (
              // ลิงก์ธรรมดา (ไม่ใช่ <Link>): ปลายทางเป็น route ที่พาออกไปเว็บของผู้ให้บริการ
              <a key={p.id} href={`/api/auth/${p.id}/start${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn-ghost w-full gap-2.5">
                <ProviderGlyph id={p.id} />
                {tr("เข้าสู่ระบบด้วย {0}", [p.label])}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
