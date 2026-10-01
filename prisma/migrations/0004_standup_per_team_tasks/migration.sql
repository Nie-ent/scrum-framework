-- Daily scrum แยกต่อทีม + เก็บงานเป็นรายการ task

ALTER TABLE "Standup"
  ADD COLUMN "teamId" TEXT,
  ADD COLUMN "yesterdayTasks" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "todayTasks" JSONB NOT NULL DEFAULT '[]';

-- แปลงข้อความเดิมเป็นรายการ task (1 บรรทัด = 1 task, ตัด bullet นำหน้า)
-- งานใน "ล่าสุดทำอะไรไป" เดิมถือว่าทำเสร็จแล้ว (progress 100%)
UPDATE "Standup" SET
  "yesterdayTasks" = COALESCE((
    SELECT jsonb_agg(jsonb_build_object('text', t, 'progress', 100) ORDER BY n)
    FROM (
      SELECT n, regexp_replace(btrim(line), '^[-*•]\s*', '') AS t
      FROM unnest(string_to_array("yesterday", E'\n')) WITH ORDINALITY AS l(line, n)
    ) x WHERE t <> ''
  ), '[]'::jsonb),
  "todayTasks" = COALESCE((
    SELECT jsonb_agg(jsonb_build_object('text', t) ORDER BY n)
    FROM (
      SELECT n, regexp_replace(btrim(line), '^[-*•]\s*', '') AS t
      FROM unnest(string_to_array("today", E'\n')) WITH ORDINALITY AS l(line, n)
    ) x WHERE t <> ''
  ), '[]'::jsonb);

-- ข้อมูลเก่าไม่รู้ว่าเป็นของทีมไหน: ให้ไปอยู่ทีมของเจ้าของ (เลือกทีมใหญ่ก่อน แล้วเรียงตามชื่อ)
-- คนที่ไม่มีทีมจะได้ teamId = null และยังดูได้ในประวัติรายคน
UPDATE "Standup" s SET "teamId" = (
  SELECT m."teamId"
  FROM "TeamMember" m JOIN "Team" t ON t."id" = m."teamId"
  WHERE m."userId" = s."userId"
  ORDER BY (t."parentId" IS NOT NULL), t."name"
  LIMIT 1
);

ALTER TABLE "Standup" DROP COLUMN "yesterday", DROP COLUMN "today";

-- DropIndex / CreateIndex
DROP INDEX "Standup_userId_date_key";
CREATE UNIQUE INDEX "Standup_userId_teamId_date_key" ON "Standup"("userId", "teamId", "date");
CREATE INDEX "Standup_teamId_date_idx" ON "Standup"("teamId", "date");

-- AddForeignKey
ALTER TABLE "Standup" ADD CONSTRAINT "Standup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
