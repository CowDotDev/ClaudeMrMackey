-- CreateTable
CREATE TABLE "CustomCommand" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomCommand_guildId_keyword_key" ON "CustomCommand"("guildId", "keyword");
