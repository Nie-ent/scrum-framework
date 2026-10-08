import "server-only";

/**
 * ส่งอีเมลผ่าน Resend (REST API) — ต้องตั้ง RESEND_API_KEY และ EMAIL_FROM (ผู้ส่งบนโดเมนที่ verify กับ Resend แล้ว)
 * ไม่ตั้ง = ไม่ส่งอีเมล: คำเชิญใช้การคัดลอกลิงก์/กดรับในแอปแทน และลืมรหัสผ่านต้องให้ผู้ดูแลรีเซ็ตให้
 */
export const isEmailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/** URL หลักของเว็บ สำหรับสร้างลิงก์ในอีเมลและลิงก์คำเชิญ */
export function appUrl(path = "") {
  const base =
    process.env.APP_URL?.replace(/\/+$/, "") ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  return `${base}${path}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** อีเมลรูปแบบเดียวกันทั้งระบบ: หัวข้อ ข้อความ และปุ่มลิงก์เดียว — คืน false ถ้าไม่ได้ส่ง (ไม่ได้ตั้งค่าหรือ Resend ปฏิเสธ) */
export async function sendEmail(mail: { to: string; subject: string; heading: string; body: string; action: { label: string; url: string } }): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(mail.heading)}</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 20px;white-space:pre-line">${escapeHtml(mail.body)}</p>
<a href="${escapeHtml(mail.action.url)}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:12px">${escapeHtml(mail.action.label)}</a>
<p style="font-size:12px;color:#64748b;margin:24px 0 0">ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้ไปเปิด: ${escapeHtml(mail.action.url)}</p>
<p style="font-size:12px;color:#94a3b8;margin:8px 0 0">Pace — Keep your team moving.</p></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html,
        text: `${mail.heading}\n\n${mail.body}\n\n${mail.action.label}: ${mail.action.url}`,
      }),
      cache: "no-store",
    });
    if (!res.ok) console.error(`resend failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}
