-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('gathering_info', 'pending_approval', 'approved', 'dev_in_progress', 'pr_open', 'merged', 'deployed', 'rejected');

-- CreateEnum
CREATE TYPE "FeatureRequestEventAuthor" AS ENUM ('op', 'bot');

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" TEXT NOT NULL,
    "discordThreadId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "opUserId" TEXT NOT NULL,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'gathering_info',
    "summary" TEXT,
    "githubPrNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequestEvent" (
    "id" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "author" "FeatureRequestEventAuthor" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureRequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureRequest_discordThreadId_key" ON "FeatureRequest"("discordThreadId");

-- CreateIndex
CREATE INDEX "FeatureRequestEvent_featureRequestId_idx" ON "FeatureRequestEvent"("featureRequestId");

-- AddForeignKey
ALTER TABLE "FeatureRequestEvent" ADD CONSTRAINT "FeatureRequestEvent_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
