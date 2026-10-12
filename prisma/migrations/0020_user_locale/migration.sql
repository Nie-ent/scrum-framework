-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'th';


-- รับเฉพาะภาษาที่แอปรองรับ
ALTER TABLE "User" ADD CONSTRAINT "User_locale_check" CHECK ("locale" IN ('th', 'en'));
