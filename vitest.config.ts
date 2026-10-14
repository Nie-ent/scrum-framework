import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * ทดสอบ 2 ชุด
 * - ฟังก์ชันล้วน (src/lib/*.test.ts) — รันได้ทุกที่
 * - ทดสอบกับฐานข้อมูล (tests/db/*.test.ts) — ต้องมี Postgres ในเครื่อง (docker compose) และตั้ง TEST_DATABASE_URL
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // โมดูลฝั่งเซิร์ฟเวอร์ import "server-only" ไว้กันหลุดไปฝั่งเบราว์เซอร์ — ในการทดสอบไม่ต้องใช้
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
      "next/cache": fileURLToPath(new URL("./tests/stubs/next-cache.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/db/setup.ts"],
    // ชุดฐานข้อมูลใช้ข้อมูลร่วมกัน — รันทีละไฟล์
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
