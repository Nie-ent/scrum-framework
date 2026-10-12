import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel จัดการ build เอง — standalone ใช้สำหรับ Docker image
  output: process.env.VERCEL ? undefined : "standalone",
  // ปลายทางมาตรฐานที่โปรแกรม MCP ใช้ค้นหาวิธีขออนุญาต (OAuth) — ตัวจริงอยู่ใต้ /api/oauth
  rewrites: async () => [
    { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/resource" },
    { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/server" },
    { source: "/.well-known/openid-configuration/:path*", destination: "/api/oauth/server" },
  ],
};

export default nextConfig;
