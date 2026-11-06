-- AlterTable
ALTER TABLE "DeadlineChange" ADD COLUMN "revisionId" TEXT;

-- CreateIndex
CREATE INDEX "DeadlineChange_revisionId_createdAt_idx" ON "DeadlineChange"("revisionId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
