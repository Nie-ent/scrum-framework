-- CreateEnum
CREATE TYPE "TeamAccess" AS ENUM ('OWNER', 'LEAD', 'MEMBER');

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "access" "TeamAccess" NOT NULL DEFAULT 'MEMBER',
ADD COLUMN     "participates" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "title" TEXT;


-- ===== ย้ายสิทธิ์เดิมมาอยู่รายทีม โดยทุกคนยังเห็นเท่าเดิม (ไม่ลบ/แก้ข้อมูลเดิม) =====

-- ชื่อบทบาทในทีม = ชื่อ role เดิมของคนนั้น (เช่น Developer, QA, Scrum Master)
UPDATE "TeamMember" m
SET "title" = r."name"
FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
WHERE u."id" = m."userId";

-- หัวหน้าทีมเดิม → LEAD
UPDATE "TeamMember" SET "access" = 'LEAD' WHERE "isLead";

-- Manager ขึ้นไป (level >= 80) เดิมเห็นภาพรวมทุกทีมจากสิทธิ์ระดับระบบ → ให้เป็น LEAD ในทีมที่อยู่แล้ว
UPDATE "TeamMember" m
SET "access" = 'LEAD', "isLead" = true
FROM "User" u JOIN "Role" r ON r."id" = u."roleId"
WHERE u."id" = m."userId" AND r."level" >= 80 AND m."access" = 'MEMBER';

-- และเพิ่มเป็น LEAD แบบไม่ต้องเช็กอิน (participates = false) ในทีมระดับบนทุกทีมที่ยังไม่ได้อยู่
-- (LEAD ของทีมระดับบนเห็นทีมย่อยด้วย จึงครอบคลุมทุกทีมเหมือนเดิม)
INSERT INTO "TeamMember" ("userId", "teamId", "access", "isLead", "participates", "title")
SELECT u."id", t."id", 'LEAD', true, false, r."name"
FROM "User" u
JOIN "Role" r ON r."id" = u."roleId"
CROSS JOIN "Team" t
WHERE r."level" >= 80 AND t."parentId" IS NULL
ON CONFLICT ("userId", "teamId") DO NOTHING;
