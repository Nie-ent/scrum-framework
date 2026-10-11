-- CreateTable
CREATE TABLE "NoteFavorite" (
    "userId" TEXT NOT NULL,
    "noteId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteFavorite_pkey" PRIMARY KEY ("userId","noteId")
);

-- CreateIndex
CREATE INDEX "NoteFavorite_noteId_idx" ON "NoteFavorite"("noteId");

-- AddForeignKey
ALTER TABLE "NoteFavorite" ADD CONSTRAINT "NoteFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFavorite" ADD CONSTRAINT "NoteFavorite_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ปิดการเข้าถึงผ่าน Supabase Data API เหมือนตารางอื่น
ALTER TABLE "NoteFavorite" ENABLE ROW LEVEL SECURITY;
