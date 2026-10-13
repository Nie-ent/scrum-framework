"use client";

import { useEffect } from "react";
import { setTheme } from "@/app/actions/language";
import { useT } from "@/components/i18n";
import { THEMES, type Theme } from "@/lib/theme";

const DARK = "(prefers-color-scheme: dark)";
/** รันก่อนวาดหน้าแรก: ธีม "ตามระบบ" ต้องรู้จากเบราว์เซอร์ จึงตั้ง data-theme ตรงนี้เพื่อไม่ให้จอกะพริบขาวก่อน */
export const THEME_SCRIPT = `document.documentElement.dataset.theme=matchMedia("${DARK}").matches?"dark":"light"`;

/** ธีม "ตามระบบ": ตามการตั้งค่าของเครื่อง และเปลี่ยนตามทันทีเมื่อเครื่องสลับโหมด (ธีมที่เลือกเองเซิร์ฟเวอร์ใส่ data-theme มาให้แล้ว) */
export function ThemeSync({ theme }: { theme: Theme }) {
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(DARK);
    const apply = () => (document.documentElement.dataset.theme = media.matches ? "dark" : "light");
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return null;
}

/** ปุ่มเลือกธีมในหน้าบัญชี — กดแล้วเปลี่ยนทั้งแอปทันที */
export function ThemeSwitch({ current }: { current: Theme }) {
  const tr = useT();
  return (
    <form action={setTheme} className="inline-flex rounded-full bg-surface-sunken p-1 text-sm">
      {THEMES.map((t) => (
        <button key={t.id} name="theme" value={t.id} aria-pressed={t.id === current} className={`inline-flex min-h-9 items-center rounded-full px-4 transition ${t.id === current ? "bg-surface font-semibold text-primary shadow-soft" : "text-muted-foreground hover:text-foreground"}`}>
          {tr(t.label)}
        </button>
      ))}
    </form>
  );
}
