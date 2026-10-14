-- CreateEnum
CREATE TYPE "AssignKind" AS ENUM ('READ', 'REVIEW', 'EDIT');

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "anchorPrefix" TEXT,
ADD COLUMN     "anchorQuote" TEXT,
ADD COLUMN     "anchorSuffix" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "assignKind" "AssignKind",
ADD COLUMN     "assignedById" TEXT,
ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "editedAt" TIMESTAMPTZ(3),
ADD COLUMN     "noteId" UUID,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMPTZ(3),
ADD COLUMN     "resolvedById" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "Label" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'slate',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabel" (
    "taskId" TEXT NOT NULL,
    "labelId" UUID NOT NULL,

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("taskId","labelId")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "taskId" TEXT NOT NULL,
    "blockedById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("taskId","blockedById")
);

-- CreateTable
CREATE TABLE "Ref" (
    "id" BIGSERIAL NOT NULL,
    "teamId" TEXT NOT NULL,
    "fromNoteId" UUID,
    "fromTaskId" TEXT,
    "fromCommentId" TEXT,
    "fromStandupId" TEXT,
    "toNoteId" UUID,
    "toTaskId" TEXT,
    "toUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ref_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Label_teamId_name_key" ON "Label"("teamId", "name");

-- CreateIndex
CREATE INDEX "TaskLabel_labelId_idx" ON "TaskLabel"("labelId");

-- CreateIndex
CREATE INDEX "TaskDependency_blockedById_idx" ON "TaskDependency"("blockedById");

-- CreateIndex
CREATE INDEX "Ref_fromNoteId_idx" ON "Ref"("fromNoteId");

-- CreateIndex
CREATE INDEX "Ref_fromTaskId_idx" ON "Ref"("fromTaskId");

-- CreateIndex
CREATE INDEX "Ref_fromCommentId_idx" ON "Ref"("fromCommentId");

-- CreateIndex
CREATE INDEX "Ref_fromStandupId_idx" ON "Ref"("fromStandupId");

-- CreateIndex
CREATE INDEX "Ref_toNoteId_idx" ON "Ref"("toNoteId");

-- CreateIndex
CREATE INDEX "Ref_toTaskId_idx" ON "Ref"("toTaskId");

-- CreateIndex
CREATE INDEX "Ref_toUserId_createdAt_idx" ON "Ref"("toUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_noteId_createdAt_idx" ON "Comment"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");

-- CreateIndex
CREATE INDEX "Comment_assigneeId_resolvedAt_idx" ON "Comment"("assigneeId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_fromNoteId_fkey" FOREIGN KEY ("fromNoteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_fromTaskId_fkey" FOREIGN KEY ("fromTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_fromCommentId_fkey" FOREIGN KEY ("fromCommentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_fromStandupId_fkey" FOREIGN KEY ("fromStandupId") REFERENCES "Standup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_toNoteId_fkey" FOREIGN KEY ("toNoteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_toTaskId_fkey" FOREIGN KEY ("toTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ความคิดเห็นต้องมีเป้าหมายเดียวพอดี: งาน / เช็กอิน / โน้ต (เดิมมีแค่งานกับเช็กอิน)
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_target_check";
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_target_check" CHECK (num_nonnulls("taskId", "standupId", "noteId") = 1);
-- ยึดข้อความได้เฉพาะความคิดเห็นในโน้ต · มอบหมายต้องมีทั้งคนและประเภท
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_anchor_check" CHECK ("anchorQuote" IS NULL OR "noteId" IS NOT NULL);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_assign_check" CHECK ("assigneeId" IS NULL OR "assignKind" IS NOT NULL);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

ALTER TABLE "Task" ADD CONSTRAINT "Task_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_self_check" CHECK ("taskId" <> "blockedById");
ALTER TABLE "Label" ADD CONSTRAINT "Label_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 40);

-- การอ้างถึง: ต้นทางเดียวและปลายทางเดียวพอดี
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_from_check" CHECK (num_nonnulls("fromNoteId", "fromTaskId", "fromCommentId", "fromStandupId") = 1);
ALTER TABLE "Ref" ADD CONSTRAINT "Ref_to_check" CHECK (num_nonnulls("toNoteId", "toTaskId", "toUserId") = 1);
