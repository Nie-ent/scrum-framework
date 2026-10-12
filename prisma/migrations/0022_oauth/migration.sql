-- AlterTable
ALTER TABLE "ApiToken" ADD COLUMN     "clientId" UUID,
ADD COLUMN     "expiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "refreshHash" TEXT;

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthCode" (
    "codeHash" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OAuthCode_pkey" PRIMARY KEY ("codeHash")
);

-- CreateTable
CREATE TABLE "UserIdentity" (
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("provider","subject")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_userId_provider_key" ON "UserIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ApiToken_refreshHash_key" ON "ApiToken"("refreshHash");

-- AddForeignKey
ALTER TABLE "ApiToken" ADD CONSTRAINT "ApiToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthCode" ADD CONSTRAINT "OAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthCode" ADD CONSTRAINT "OAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ปิดการเข้าถึงผ่าน Supabase Data API เหมือนตารางอื่น
ALTER TABLE "OAuthClient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OAuthCode" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserIdentity" ENABLE ROW LEVEL SECURITY;
