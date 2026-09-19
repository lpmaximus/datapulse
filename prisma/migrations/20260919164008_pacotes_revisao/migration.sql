-- AlterEnum
ALTER TYPE "TaskStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "DocumentRevision" ADD COLUMN     "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX "DocumentRevision_milestoneId_idx" ON "DocumentRevision"("milestoneId");

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
