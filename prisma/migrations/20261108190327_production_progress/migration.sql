-- AlterTable
ALTER TABLE "DocumentRevision" ADD COLUMN     "productionProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "progressUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RevisionProgressLog" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "fromProgress" INTEGER NOT NULL,
    "toProgress" INTEGER NOT NULL,
    "note" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RevisionProgressLog_revisionId_createdAt_idx" ON "RevisionProgressLog"("revisionId", "createdAt");

-- AddForeignKey
ALTER TABLE "RevisionProgressLog" ADD CONSTRAINT "RevisionProgressLog_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
