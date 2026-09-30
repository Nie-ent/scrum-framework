-- ทีมซ้อนกันได้ (parentId) + คนหนึ่งอยู่ได้หลายทีม (TeamMember)

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "parentId" TEXT;

-- CreateTable
CREATE TABLE "TeamMember" (
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("userId","teamId")
);

-- ย้ายสมาชิกเดิมจาก User.teamId — คนที่ role level >= 50 (Lead เดิม) เป็นหัวหน้าทีมนั้น เพื่อให้สิทธิ์เดิมไม่หาย
INSERT INTO "TeamMember" ("userId", "teamId", "isLead")
SELECT u."id", u."teamId", r."level" >= 50
FROM "User" u
JOIN "Role" r ON r."id" = u."roleId"
WHERE u."teamId" IS NOT NULL;

-- DropForeignKey / DropColumn
ALTER TABLE "User" DROP CONSTRAINT "User_teamId_fkey";
ALTER TABLE "User" DROP COLUMN "teamId";

-- CreateIndex
CREATE INDEX "TeamMember_teamId_idx" ON "TeamMember"("teamId");
CREATE INDEX "Team_parentId_idx" ON "Team"("parentId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ปิดการเข้าถึงผ่าน Supabase Data API เหมือนตารางอื่น
ALTER TABLE "TeamMember" ENABLE ROW LEVEL SECURITY;
