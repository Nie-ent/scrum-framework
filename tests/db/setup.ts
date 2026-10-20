/**
 * ทดสอบกับฐานข้อมูล: ใช้ฐานข้อมูลแยก (TEST_DATABASE_URL) เท่านั้น ไม่แตะข้อมูลที่ใช้พัฒนา
 * เตรียมครั้งแรก:
 *   docker compose up -d db
 *   psql … -c "CREATE DATABASE scrum_test"
 *   DATABASE_URL=$TEST_DATABASE_URL DIRECT_URL=$TEST_DATABASE_URL npx prisma migrate deploy && node prisma/seed.mjs
 * ไม่ได้ตั้ง TEST_DATABASE_URL = ข้ามชุดนี้
 */
export const DB_TESTS = Boolean(process.env.TEST_DATABASE_URL);
if (DB_TESTS) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  // ไม่ส่งอีเมล/push จริงระหว่างทดสอบ (แจ้งเตือนในแอปยังเขียนลงฐานข้อมูลตามปกติ)
  delete process.env.RESEND_API_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  // ไม่แตะที่เก็บไฟล์จริง (ลบแถวไฟล์ได้โดยไม่เรียก Storage)
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
