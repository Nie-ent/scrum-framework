import Image from "next/image";
import { ensureLang, tr } from "@/lib/i18n/server";
import { LanguageSwitch } from "@/components/language-switch";

/** กรอบหน้าที่ยังไม่ได้ login (เข้าสู่ระบบ, สมัคร, ลืมรหัสผ่าน, คำเชิญ) */
export async function AuthShell({ children }: { children: React.ReactNode }) {
  await ensureLang();
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e0e7ff_0,_transparent_32rem)] px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="Pace" width={64} height={64} priority className="mx-auto mb-3" />
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Pace</h1>
          <p className="text-sm text-slate-500">{tr("งาน บันทึก และทีม ในที่เดียว")}</p>
        </div>
        {children}
        <div className="mt-6 flex justify-center"><LanguageSwitch compact /></div>
      </div>
    </main>
  );
}
