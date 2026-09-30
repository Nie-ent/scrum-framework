// Seed แบบ idempotent: รันซ้ำได้ทุกครั้งที่ container start โดยไม่ทับข้อมูลเดิม
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ROLES = [
  { name: "Admin", level: 100, description: "จัดการระบบทั้งหมด" },
  { name: "Manager", level: 80, description: "ดูภาพรวมทุกทีม" },
  { name: "Scrum Master", level: 50, description: "ดูภาพรวมทีมตัวเอง" },
  { name: "Team Lead", level: 50, description: "ดูภาพรวมทีมตัวเอง" },
  { name: "Developer", level: 10, description: "ส่ง daily scrum" },
  { name: "QA", level: 10, description: "ส่ง daily scrum" },
];

async function main() {
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { name: role.name }, update: {}, create: role });
  }

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: "Admin" } });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: { email, name: "Administrator", passwordHash: await bcrypt.hash(password, 10), roleId: adminRole.id },
    });
    console.log(`Seeded admin user: ${email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
