/** ธีมของแอป: light = สว่าง (ค่าเริ่มต้น) · dark = มืด · system = ตามการตั้งค่าของเครื่อง */
export type Theme = "light" | "dark" | "system";
export const THEME_COOKIE = "pace_theme";
export const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "สว่าง" },
  { id: "dark", label: "มืด" },
  { id: "system", label: "ตามระบบ" },
];
export const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark" || value === "system";
/** สีแถบสถานะของเบราว์เซอร์/มือถือ ให้เข้ากับพื้นของแต่ละธีม */
export const THEME_COLOR = { light: "#ffffff", dark: "#1b1c24" };
