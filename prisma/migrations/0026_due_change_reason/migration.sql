-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "dueChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dueFrom" DATE,
ADD COLUMN     "dueTo" DATE;

