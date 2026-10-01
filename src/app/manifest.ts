import type { MetadataRoute } from "next";

/** ทำให้ติดตั้งเป็นแอปบนหน้าจอหลักได้ (PWA) — เปิดเต็มจอแบบไม่มีแถบเบราว์เซอร์ */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pace",
    short_name: "Pace",
    description: "Keep your team moving. — Daily scrum และภาพรวมทีม",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fc",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "เช็กอินวันนี้", short_name: "เช็กอิน", url: "/standup" }],
  };
}
