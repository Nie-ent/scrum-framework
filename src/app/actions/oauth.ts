"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { checkAuthorize, createCode, redirectWith } from "@/lib/oauth";

/** ผู้ใช้กดอนุญาต/ปฏิเสธในหน้ายินยอม — ตรวจคำขอซ้ำทั้งหมด (ค่าในฟอร์มแก้ได้) แล้วส่งกลับไปที่โปรแกรม */
export async function decideOAuth(formData: FormData) {
  const user = await requireUser();
  const checked = await checkAuthorize({ ...Object.fromEntries(formData), response_type: "code", code_challenge_method: "S256" });
  if (!checked.ok) redirect("redirect" in checked && checked.redirect ? checked.redirect : "/");
  const { params } = checked;
  if (formData.get("decision") !== "allow") redirect(redirectWith(params.redirect_uri, { error: "access_denied", state: params.state }));
  const code = await createCode(user.id, params, formData.get("readOnly") === "on");
  redirect(redirectWith(params.redirect_uri, { code, state: params.state }));
}
