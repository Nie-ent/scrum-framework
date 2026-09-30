import type { Metadata } from "next";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className={`${plex.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
