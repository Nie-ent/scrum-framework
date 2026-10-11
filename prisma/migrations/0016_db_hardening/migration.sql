-- ===== ปรับฐานข้อมูลให้เข้มงวดขึ้น — ไม่ลบข้อมูลและไม่เปลี่ยนค่าที่เก็บอยู่ =====

-- 1) เวลาเก็บแบบมี timezone
-- ค่าเดิมทุกตัวเป็น UTC (Prisma เขียน UTC เสมอ) จึงระบุ AT TIME ZONE 'UTC' ทุกคอลัมน์
-- เพื่อให้ "2026-10-08 14:00" กลายเป็น "2026-10-08 14:00+00" ไม่ว่าเซิร์ฟเวอร์จะตั้ง timezone ไว้อย่างไร

-- AlterTable
ALTER TABLE "Attachment" ALTER COLUMN "uploadedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "uploadedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
ALTER COLUMN "importantAt" SET DATA TYPE TIMESTAMPTZ(3) USING "importantAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "AuthToken" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
ALTER COLUMN "usedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "usedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Avatar" ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Invite" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMPTZ(3) USING "expiresAt" AT TIME ZONE 'UTC',
ALTER COLUMN "acceptedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "acceptedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "revokedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "readAt" SET DATA TYPE TIMESTAMPTZ(3) USING "readAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "PushSubscription" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "RateLimit" ALTER COLUMN "resetAt" SET DATA TYPE TIMESTAMPTZ(3) USING "resetAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Standup" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "doneAt" SET DATA TYPE TIMESTAMPTZ(3) USING "doneAt" AT TIME ZONE 'UTC',
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "deletedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "deletedAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "Team" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "TeamMember" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
ALTER COLUMN "avatarUpdatedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "avatarUpdatedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "emailVerifiedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "emailVerifiedAt" AT TIME ZONE 'UTC',
ALTER COLUMN "passwordChangedAt" SET DATA TYPE TIMESTAMPTZ(3) USING "passwordChangedAt" AT TIME ZONE 'UTC';

-- 2) อีเมลเป็นตัวพิมพ์เล็กเสมอ — unique index เดิมจึงกันอีเมลซ้ำที่ต่างกันแค่ตัวพิมพ์ได้จริง
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_email_lowercase_check" CHECK ("email" = lower(btrim("email")));

-- 3) กฎข้อมูลที่เดิมตรวจในโค้ดอย่างเดียว ให้ฐานข้อมูลตรวจด้วย
ALTER TABLE "Task" ADD CONSTRAINT "Task_progress_range_check" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "Task" ADD CONSTRAINT "Task_number_positive_check" CHECK ("number" IS NULL OR "number" > 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_title_not_blank_check" CHECK (btrim("title") <> '');
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_progress_range_check" CHECK (
  ("progressFrom" IS NULL OR "progressFrom" BETWEEN 0 AND 100) AND ("progressTo" IS NULL OR "progressTo" BETWEEN 0 AND 100)
);
ALTER TABLE "Team" ADD CONSTRAINT "Team_name_not_blank_check" CHECK (btrim("name") <> '');
ALTER TABLE "Team" ADD CONSTRAINT "Team_not_own_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "Team" ADD CONSTRAINT "Team_task_seq_check" CHECK ("taskSeq" >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_blank_check" CHECK (btrim("name") <> '');
ALTER TABLE "Role" ADD CONSTRAINT "Role_level_positive_check" CHECK ("level" > 0);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_positive_check" CHECK ("size" > 0);
