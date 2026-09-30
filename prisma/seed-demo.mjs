// ข้อมูลตัวอย่างสำหรับลองระบบ: npm run db:seed-demo (รหัสผ่านทุกคน = password123)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const TZ = process.env.APP_TIMEZONE ?? "Asia/Bangkok";

const dayKey = (offset) => {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
};

async function main() {
  const role = (name) => prisma.role.findUniqueOrThrow({ where: { name } });
  // ทีมใหญ่ Alpha → ทีมย่อย Alpha Web / Alpha QA
  const tribe = await prisma.team.upsert({ where: { name: "Alpha" }, update: {}, create: { name: "Alpha" } });
  const subTeam = (name) =>
    prisma.team.upsert({ where: { name }, update: {}, create: { name, parentId: tribe.id } });
  const web = await subTeam("Alpha Web");
  const qa = await subTeam("Alpha QA");
  const passwordHash = await bcrypt.hash("password123", 10);

  // teams: [teamId, isLead] — ก้องอยู่ 2 ทีมย่อย, นุ่นเป็นหัวหน้าทีม QA
  const people = [
    { email: "lead@example.com", name: "สมชาย (Lead)", role: "Scrum Master", teams: [[tribe.id, true]] },
    { email: "dev1@example.com", name: "สมหญิง", role: "Developer", teams: [[web.id, false]] },
    { email: "dev2@example.com", name: "ก้อง", role: "Developer", teams: [[web.id, false], [qa.id, false]] },
    { email: "qa@example.com", name: "นุ่น", role: "QA", teams: [[qa.id, true]] },
  ];
  const users = [];
  for (const p of people) {
    const { id: roleId } = await role(p.role);
    users.push(
      await prisma.user.upsert({
        where: { email: p.email },
        update: {},
        create: { email: p.email, name: p.name, passwordHash, roleId },
      }),
    );
    const user = users.at(-1);
    for (const [teamId, isLead] of p.teams) {
      await prisma.teamMember.upsert({
        where: { userId_teamId: { userId: user.id, teamId } },
        update: {},
        create: { userId: user.id, teamId, isLead },
      });
    }
  }
  await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: { email: "manager@example.com", name: "ผู้จัดการ", passwordHash, roleId: (await role("Manager")).id },
  });

  const samples = [
    { yesterday: "ทำ API login เสร็จ", today: "เชื่อมหน้า dashboard กับ API", blockers: "รอ spec จาก PO เรื่อง report", notWorking: "meeting ยาวเกิน 30 นาที", workingWell: "pair programming ช่วยให้เร็วขึ้น" },
    { yesterday: "แก้ bug หน้า profile", today: "เขียน unit test ส่วน auth", workingWell: "code review เร็วดี" },
    { yesterday: "เทส regression sprint 3", today: "เขียน test case ฟีเจอร์ใหม่", notWorking: "environment staging ล่มบ่อย" },
  ];
  for (let offset = -4; offset <= 0; offset++) {
    const date = new Date(`${dayKey(offset)}T00:00:00.000Z`);
    for (const [i, user] of users.entries()) {
      if (offset === 0 && i === users.length - 1) continue; // ให้มีคนยังไม่ส่งวันนี้
      const s = samples[(i + offset + 10) % samples.length];
      await prisma.standup.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: {},
        create: { userId: user.id, date, ...s },
      });
    }
  }
  console.log("Demo data seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
