-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "personalOfId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Team_personalOfId_key" ON "Team"("personalOfId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_personalOfId_fkey" FOREIGN KEY ("personalOfId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- พื้นที่ส่วนตัวเป็นทีมระดับบนเสมอ (ไม่มีทีมแม่)
ALTER TABLE "Team" ADD CONSTRAINT "Team_personal_is_root_check" CHECK ("personalOfId" IS NULL OR "parentId" IS NULL);
