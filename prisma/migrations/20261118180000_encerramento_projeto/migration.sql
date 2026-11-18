-- CreateEnum
CREATE TYPE "ProjectClosureType" AS ENUM ('COMPLETED', 'INTERRUPTED');

-- CreateTable
CREATE TABLE "ProjectStatusChange" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromStatus" "ProjectStatus" NOT NULL,
    "toStatus" "ProjectStatus" NOT NULL,
    "reason" TEXT,
    "closureType" "ProjectClosureType",
    "closedOn" TIMESTAMP(3),
    "acceptanceRef" TEXT,
    "summary" TEXT,
    "lessonsKeep" TEXT,
    "lessonsImprove" TEXT,
    "openItems" JSONB,
    "metrics" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectStatusChange_projectId_createdAt_idx" ON "ProjectStatusChange"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectStatusChange_userId_idx" ON "ProjectStatusChange"("userId");

-- AddForeignKey
ALTER TABLE "ProjectStatusChange" ADD CONSTRAINT "ProjectStatusChange_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStatusChange" ADD CONSTRAINT "ProjectStatusChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
