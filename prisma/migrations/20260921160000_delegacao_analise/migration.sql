-- CreateEnum
CREATE TYPE "DelegationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentAction" ADD VALUE 'DELEGATION_REQUESTED';
ALTER TYPE "DocumentAction" ADD VALUE 'DELEGATION_ACCEPTED';
ALTER TYPE "DocumentAction" ADD VALUE 'DELEGATION_DECLINED';
ALTER TYPE "DocumentAction" ADD VALUE 'DELEGATION_CANCELLED';

-- CreateTable
CREATE TABLE "AnalysisDelegation" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "DelegationStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "responseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisDelegation_revisionId_status_idx" ON "AnalysisDelegation"("revisionId", "status");

-- CreateIndex
CREATE INDEX "AnalysisDelegation_toUserId_status_idx" ON "AnalysisDelegation"("toUserId", "status");

-- CreateIndex
CREATE INDEX "AnalysisDelegation_fromUserId_idx" ON "AnalysisDelegation"("fromUserId");

-- AddForeignKey
ALTER TABLE "AnalysisDelegation" ADD CONSTRAINT "AnalysisDelegation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisDelegation" ADD CONSTRAINT "AnalysisDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisDelegation" ADD CONSTRAINT "AnalysisDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
