-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'ANSWERED', 'DISMISSED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Milestone" ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "type" TEXT,
    "description" TEXT NOT NULL,
    "ownerId" TEXT,
    "waitingOn" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestDocument" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadlineChange" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT,
    "requestId" TEXT,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Request_projectId_status_idx" ON "Request"("projectId", "status");

-- CreateIndex
CREATE INDEX "Request_milestoneId_idx" ON "Request"("milestoneId");

-- CreateIndex
CREATE INDEX "Request_ownerId_status_idx" ON "Request"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Request_status_dueAt_idx" ON "Request"("status", "dueAt");

-- CreateIndex
CREATE INDEX "RequestDocument_documentId_idx" ON "RequestDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestDocument_requestId_documentId_key" ON "RequestDocument"("requestId", "documentId");

-- CreateIndex
CREATE INDEX "DeadlineChange_milestoneId_createdAt_idx" ON "DeadlineChange"("milestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "DeadlineChange_requestId_createdAt_idx" ON "DeadlineChange"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "Milestone_parentId_idx" ON "Milestone"("parentId");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineChange" ADD CONSTRAINT "DeadlineChange_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
