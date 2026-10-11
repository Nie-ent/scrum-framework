"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLang, LANG_COOKIE } from "@/lib/i18n/core";

/** เปลี่ยนภาษาที่แสดง — จำไว้ใน cookie ของเบราว์เซอร์นี้ (ใช้ได้ทั้งก่อนและหลังเข้าสู่ระบบ) */
export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang");
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
