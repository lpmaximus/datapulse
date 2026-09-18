-- CreateEnum
CREATE TYPE "AccSyncStatus" AS ENUM ('NEVER_RUN', 'OK', 'FAILED', 'REAUTH_REQUIRED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "accConnectionId" TEXT,
ADD COLUMN     "accProjectId" TEXT,
ADD COLUMN     "accProjectName" TEXT;

-- CreateTable
CREATE TABLE "AccConnection" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "hubName" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "authorizedByHash" TEXT,
    "authorizedByName" TEXT,
    "dataRequestId" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" "AccSyncStatus" NOT NULL DEFAULT 'NEVER_RUN',
    "lastSyncError" TEXT,
    "lastJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccConnection_hubId_key" ON "AccConnection"("hubId");

-- CreateIndex
CREATE INDEX "AccConnection_lastSyncStatus_idx" ON "AccConnection"("lastSyncStatus");

-- CreateIndex
CREATE INDEX "Project_accConnectionId_idx" ON "Project"("accConnectionId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_accConnectionId_fkey" FOREIGN KEY ("accConnectionId") REFERENCES "AccConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
