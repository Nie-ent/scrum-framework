-- รันซ้ำได้: production เพิ่มคอลัมน์นี้ด้วยมือไปก่อนแล้ว

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "noteId" UUID;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Attachment_noteId_idx" ON "Attachment"("noteId");

-- AddForeignKey
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Attachment_noteId_fkey') THEN
    ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
