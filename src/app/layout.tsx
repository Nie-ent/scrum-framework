import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans_Thai({
  variable: "--font-plex",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Pace", template: "%s · Pace" },
  description: "Keep your team moving. — Daily scrum และภาพรวมทีม",
  applicationName: "Pace",
  // iPhone: เปิดเต็มจอเมื่อเพิ่มลงหน้าจอโฮม
  appleWebApp: { capable: true, title: "Pace", statusBarStyle: "default" },
};

// viewportFit: cover เพื่อให้ใช้ safe-area-inset กับแถบเมนูล่างบน iPhone ได้
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#f7f8fc] text-slate-900 selection:bg-indigo-100">{children}</body>
    </html>
  );
}
