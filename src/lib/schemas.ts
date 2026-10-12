import * as z from "zod";
import { isDateKey } from "./dates";

/**
 * กฎของฟอร์มที่ใช้ร่วมกันทั้งสองฝั่ง: เบราว์เซอร์ตรวจทันทีระหว่างกรอก (react-hook-form)
 * และ server action ตรวจซ้ำด้วย schema เดียวกันก่อนบันทึก — server คือด่านที่เชื่อถือได้เสมอ
 */

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "อีเมลไม่ถูกต้อง" }));

const displayName = z.string().trim().min(1, { error: "กรุณาระบุชื่อ" }).max(100, { error: "ชื่อยาวเกิน 100 ตัวอักษร" });
const newPassword = z.string().min(8, { error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" }).max(200, { error: "รหัสผ่านยาวเกินไป" });
const samePassword = { error: "ยืนยันรหัสผ่านไม่ตรงกัน", path: ["confirm"] };

export const LoginFields = z.object({
  email,
  password: z.string().min(1, { error: "กรุณากรอกรหัสผ่าน" }),
});

export const SignupFields = z.object({ name: displayName, email, password: newPassword });

export const ForgotFields = z.object({ email });

export const NewPasswordFields = z
  .object({ next: newPassword, confirm: z.string() })
  .refine((d) => d.next === d.confirm, samePassword);

export const ChangePasswordFields = z
  .object({ current: z.string().min(1, { error: "กรุณากรอกรหัสผ่านปัจจุบัน" }), next: newPassword, confirm: z.string() })
  .refine((d) => d.next === d.confirm, samePassword);

export const teamName = z.string().trim().min(1, { error: "กรุณาระบุชื่อทีม" }).max(60, { error: "ชื่อทีมยาวเกิน 60 ตัวอักษร" });

/** ชื่อบทบาทในทีม (Dev, PM, PO…) — ว่างได้ */
export const roleTitle = z
  .string()
  .trim()
  .max(40, { error: "ชื่อบทบาทยาวเกิน 40 ตัวอักษร" })
  .transform((v) => v || null);

export const TeamFields = z.object({ name: teamName, title: roleTitle });

export const InviteFields = z.object({ email, access: z.enum(["LEAD", "MEMBER"]), title: roleTitle });

export const TaskFields = z.object({
  title: z.string().trim().min(1, { error: "กรุณาระบุชื่องาน" }).max(200, { error: "ชื่องานยาวเกิน 200 ตัวอักษร" }),
  description: z.string().trim().max(2000, { error: "รายละเอียดยาวเกิน 2,000 ตัวอักษร" }),
  assigneeId: z.string().min(1, { error: "กรุณาเลือกผู้รับงาน" }),
  dueDate: z.string().refine((v) => v === "" || isDateKey(v), { error: "วันที่ไม่ถูกต้อง" }),
});

export const noteTitle = z
  .string()
  .trim()
  .min(1, { error: "กรุณาตั้งชื่อ" })
  .max(120, { error: "ชื่อยาวเกิน 120 ตัวอักษร" })
  // อักขระที่ใช้ในไวยากรณ์ลิงก์ [[ชื่อ|ข้อความ]] ใส่ในชื่อไม่ได้
  .refine((v) => !/[\[\]|]/.test(v), { error: "ชื่อห้ามมี [ ] หรือ |" });

export const NoteFields = z.object({
  title: noteTitle,
  // ฟอร์มส่งขึ้นบรรทัดใหม่มาเป็น \r\n — เก็บเป็น \n แบบเดียวเสมอ
  content: z.string().max(200_000, { error: "เนื้อหายาวเกินไป" }).transform((v) => v.replace(/\r\n?/g, "\n")),
});
