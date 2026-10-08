-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT,
    "taskId" TEXT,
    "commentId" TEXT,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "importantAt" TIMESTAMP(3),
    "importantById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_path_key" ON "Attachment"("path");

-- CreateIndex
CREATE INDEX "Attachment_taskId_idx" ON "Attachment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_commentId_idx" ON "Attachment"("commentId");

-- CreateIndex
CREATE INDEX "Attachment_importantAt_idx" ON "Attachment"("importantAt");

-- CreateIndex
CREATE INDEX "Attachment_expiresAt_idx" ON "Attachment"("expiresAt");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_importantById_fkey" FOREIGN KEY ("importantById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ไฟล์แนบอยู่ใต้งานหรือใต้ความคิดเห็น ไม่ใช่ทั้งสองอย่าง (ว่างทั้งคู่ = เจ้าของถูกลบ รอ cron เก็บกวาด)
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_target_check" CHECK ("taskId" IS NULL OR "commentId" IS NULL);

-- ปิดการเข้าถึงผ่าน Supabase Data API เหมือนตารางอื่น
ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
