import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel จัดการ build เอง — standalone ใช้สำหรับ Docker image
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
