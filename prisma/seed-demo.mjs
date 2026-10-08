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
  // ชื่อทีมไม่ unique ทั้งระบบแล้ว (ซ้ำได้ข้ามลูกค้า) จึงหาเองก่อนสร้าง
  const team = async (name, parentId = null) =>
    (await prisma.team.findFirst({ where: { name, parentId } })) ?? (await prisma.team.create({ data: { name, parentId } }));
  const tribe = await team("Alpha");
  const subTeam = (name) => team(name, tribe.id);
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
        create: { userId: user.id, teamId, isLead, access: isLead ? "LEAD" : "MEMBER", title: p.role },
      });
    }
  }
  await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: { email: "manager@example.com", name: "ผู้จัดการ", passwordHash, roleId: (await role("Manager")).id },
  });

  const samples = [
    { yesterdayTasks: ["ทำ API login เสร็จ", "review PR #12"], todayTasks: ["เชื่อมหน้า dashboard กับ API", "แก้ bug หน้า profile"], blockers: "รอ spec จาก PO เรื่อง report", notWorking: "meeting ยาวเกิน 30 นาที", workingWell: "pair programming ช่วยให้เร็วขึ้น" },
    { yesterdayTasks: ["แก้ bug หน้า profile"], todayTasks: ["เขียน unit test ส่วน auth"], workingWell: "code review เร็วดี" },
    { yesterdayTasks: ["เทส regression sprint 3"], todayTasks: ["เขียน test case ฟีเจอร์ใหม่", "อัปเดต test plan"], notWorking: "environment staging ล่มบ่อย" },
  ];
  // เขียนแยกต่อทีม: 1 รายการต่อคน ต่อทีม ต่อวัน
  const memberships = await prisma.teamMember.findMany({ where: { userId: { in: users.map((u) => u.id) } } });
  for (let offset = -4; offset <= 0; offset++) {
    const date = new Date(`${dayKey(offset)}T00:00:00.000Z`);
    for (const [i, m] of memberships.entries()) {
      if (offset === 0 && i % 3 === 2) continue; // ให้มีคนยังไม่ส่งวันนี้
      const s = samples[(i + offset + 10) % samples.length];
      await prisma.standup.upsert({
        where: { userId_teamId_date: { userId: m.userId, teamId: m.teamId, date } },
        update: {},
        create: {
          userId: m.userId,
          teamId: m.teamId,
          date,
          ...s,
          yesterdayTasks: s.yesterdayTasks.map((text, j) => ({ text, progress: j % 2 === 0 ? 100 : 40 })),
          todayTasks: s.todayTasks.map((text) => ({ text })),
        },
      });
    }
  }
  // งานที่หัวหน้ามอบหมาย (สร้างครั้งเดียว)
  if ((await prisma.task.count()) === 0) {
    const byEmail = Object.fromEntries(users.map((u) => [u.email, u.id]));
    const lead = byEmail["lead@example.com"];
    await prisma.task.createMany({
      data: [
        { teamId: web.id, assigneeId: byEmail["dev1@example.com"], createdById: lead, title: "ทำหน้า checkout ให้รองรับ PromptPay", progress: 40 },
        { teamId: web.id, assigneeId: byEmail["dev2@example.com"], createdById: lead, title: "แก้ performance หน้า dashboard", dueDate: new Date(`${dayKey(3)}T00:00:00.000Z`) },
        { teamId: qa.id, assigneeId: byEmail["qa@example.com"], createdById: lead, title: "เขียน test plan sprint 4", progress: 70 },
      ],
    });
  }
  console.log("Demo data seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
