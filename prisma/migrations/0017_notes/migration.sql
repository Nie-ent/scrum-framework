-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('FOLDER', 'NOTE');

-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teamId" TEXT NOT NULL,
    "parentId" UUID,
    "kind" "NoteKind" NOT NULL DEFAULT 'NOTE',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "updatedById" TEXT,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteLink" (
    "id" BIGSERIAL NOT NULL,
    "fromId" UUID NOT NULL,
    "toNoteId" UUID,
    "toTaskId" TEXT,

    CONSTRAINT "NoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_teamId_parentId_idx" ON "Note"("teamId", "parentId");

-- CreateIndex
CREATE INDEX "Note_teamId_title_idx" ON "Note"("teamId", "title");

-- CreateIndex
CREATE INDEX "NoteLink_toNoteId_idx" ON "NoteLink"("toNoteId");

-- CreateIndex
CREATE INDEX "NoteLink_toTaskId_idx" ON "NoteLink"("toTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteLink_fromId_toNoteId_key" ON "NoteLink"("fromId", "toNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteLink_fromId_toTaskId_key" ON "NoteLink"("fromId", "toTaskId");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_toNoteId_fkey" FOREIGN KEY ("toNoteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ลิงก์ชี้ไปที่โน้ตหรืองาน อย่างใดอย่างหนึ่งเท่านั้น
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_target_check" CHECK (("toNoteId" IS NULL) <> ("toTaskId" IS NULL));
ALTER TABLE "Note" ADD CONSTRAINT "Note_title_not_blank_check" CHECK (btrim("title") <> '');
ALTER TABLE "Note" ADD CONSTRAINT "Note_not_own_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- ปิดการเข้าถึงผ่าน Supabase Data API เหมือนตารางอื่น
ALTER TABLE "Note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NoteLink" ENABLE ROW LEVEL SECURITY;
