"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isLang, LANG_COOKIE } from "@/lib/i18n/core";

/** เปลี่ยนภาษาที่แสดง — จำไว้ใน cookie ของเบราว์เซอร์นี้ (ใช้ได้ทั้งก่อนและหลังเข้าสู่ระบบ) */
export async function setLanguage(formData: FormData) {
  const lang = formData.get("lang");
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // จำไว้กับบัญชีด้วย: ใช้เป็นภาษาของอีเมล/แจ้งเตือนที่ส่งถึงคนนี้ และเป็นค่าเริ่มต้นเมื่อเข้าสู่ระบบจากเครื่องอื่น
  const user = await getCurrentUser();
  if (user) await prisma.user.update({ where: { id: user.id }, data: { locale: lang } });
  revalidatePath("/", "layout");
}
