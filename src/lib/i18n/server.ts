import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { isLang, localeOf, translate, type Lang, type Translate, type Vars } from "./core";
import { LANG_COOKIE } from "./core";

/** ภาษาของคำขอนี้ (เก็บต่อคำขอด้วย React cache) — ตั้งค่าโดย ensureLang ก่อนเริ่มวาดหน้า */
const store = cache(() => ({ lang: "th" as Lang }));

/**
 * อ่านภาษาจาก cookie แล้วจำไว้ให้ tr() ใช้ตลอดคำขอนี้
 * ถูกเรียกจาก getCurrentUser อยู่แล้ว — หน้าที่ไม่ต้องล็อกอิน (เช่นหน้าเข้าสู่ระบบ) ต้องเรียกเอง
 */
export const ensureLang = cache(async (): Promise<Lang> => {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(value) ? value : "th";
  store().lang = lang;
  return lang;
});

export const currentLang = (): Lang => store().lang;
export const currentLocale = () => localeOf(store().lang);

/** ตัวแปลของภาษาที่ระบุ — ใช้เมื่อข้อความไม่ได้ส่งถึงคนที่กำลังใช้งาน (อีเมล/แจ้งเตือนถึงคนอื่น) */
export const trFor = (lang: unknown): Translate => {
  const use: Lang = isLang(lang) ? lang : "th";
  return (text, vars) => translate(use, text, vars);
};

/** ตัวแปลของผู้ที่ส่งคำขอนี้ — ใช้ใน server action (อยู่นอกการวาดหน้า จึงต้องอ่านภาษาเอง) */
export const getTr = async (): Promise<Translate> => trFor(await ensureLang());

/** แปลข้อความฝั่ง server — ใช้ใน server component / server action (หลัง ensureLang) */
export const tr = (text: string, vars?: Vars): string => translate(store().lang, text, vars);
