import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/tooltip";
import { I18nProvider } from "@/components/i18n";
import { ensureLang } from "@/lib/i18n/server";
import { cookies } from "next/headers";
import { ThemeSync, THEME_SCRIPT } from "@/components/theme";
import { isTheme, THEME_COLOR, THEME_COOKIE, type Theme } from "@/lib/theme";
import { PaceAnalytics } from "@/components/analytics";

const plex = IBM_Plex_Sans_Thai({
  variable: "--font-plex",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Pace", template: "%s · Pace" },
  description: "Keep your team moving. — tasks, notes and team check-ins in one place",
  applicationName: "Pace",
  // iPhone: เปิดเต็มจอเมื่อเพิ่มลงหน้าจอโฮม
  appleWebApp: { capable: true, title: "Pace", statusBarStyle: "default" },
};

// viewportFit: cover เพื่อให้ใช้ safe-area-inset กับแถบเมนูล่างบน iPhone ได้
export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
  };
}

/** ธีมที่เลือกไว้ในเบราว์เซอร์นี้ (ไม่เคยเลือก = สว่าง) */
async function currentTheme(): Promise<Theme> {
  const saved = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(saved) ? saved : "light";
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, theme] = [await ensureLang(), await currentTheme()];
  return (
    // "ตามระบบ": เซิร์ฟเวอร์ไม่รู้ว่าเครื่องใช้โหมดไหน สคริปต์ใน <head> จึงใส่ data-theme เองก่อนวาดหน้า (React ต้องไม่ถือว่าเป็นความต่าง)
    <html lang={lang} data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning className={`${plex.variable} h-full antialiased`}>
      {theme === "system" && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        </head>
      )}
      <body className="min-h-full bg-background text-slate-900 selection:bg-indigo-100"><ThemeSync theme={theme} /><I18nProvider lang={lang}><TooltipProvider>{children}</TooltipProvider></I18nProvider><PaceAnalytics /></body>
    </html>
  );
}
