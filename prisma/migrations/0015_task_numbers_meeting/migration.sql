-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "number" INTEGER;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "meetingUrl" TEXT,
ADD COLUMN     "taskSeq" INTEGER NOT NULL DEFAULT 0;

-- ให้เลขงานที่มีอยู่แล้ว เรียงตามเวลาที่สร้างภายในแต่ละทีม (รวมงานที่ถูกลบแบบซ่อน เพื่อไม่ให้เลขชนกันตอนกู้คืน)
UPDATE "Task" t SET "number" = n.rn
FROM (SELECT "id", row_number() OVER (PARTITION BY "teamId" ORDER BY "createdAt", "id") AS rn FROM "Task") n
WHERE n."id" = t."id";

UPDATE "Team" tm SET "taskSeq" = c.total
FROM (SELECT "teamId", count(*)::int AS total FROM "Task" GROUP BY "teamId") c
WHERE c."teamId" = tm."id";

-- CreateIndex
CREATE UNIQUE INDEX "Task_teamId_number_key" ON "Task"("teamId", "number");

