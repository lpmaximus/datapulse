-- CreateEnum
CREATE TYPE "TaskKind" AS ENUM ('TASK', 'MILESTONE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE');

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "kind" "TaskKind" NOT NULL DEFAULT 'TASK',
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- CreateTable
CREATE TABLE "Impediment" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "waitingOn" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Impediment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Impediment_milestoneId_resolvedAt_idx" ON "Impediment"("milestoneId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Impediment_resolvedAt_idx" ON "Impediment"("resolvedAt");

-- CreateIndex
CREATE INDEX "Milestone_projectId_status_idx" ON "Milestone"("projectId", "status");

-- CreateIndex
CREATE INDEX "Milestone_assigneeId_status_idx" ON "Milestone"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impediment" ADD CONSTRAINT "Impediment_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Impediment" ADD CONSTRAINT "Impediment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
