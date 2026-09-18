/*
  Warnings:

  - You are about to drop the column `client` on the `Project` table. All the data in the column will be lost.
  - You are about to drop the column `sector` on the `Project` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'SPECIALIST', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DocumentAction" AS ENUM ('CREATED', 'SUBMITTED', 'COMMENTED', 'REJECTED', 'APPROVED_WITH_COMMENTS', 'APPROVED', 'REVISED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SignalRequestStatus" AS ENUM ('PENDING', 'ANSWERED', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnalysisEffect" AS ENUM ('APPROVES', 'APPROVES_WITH_COMMENTS', 'COMMENTS', 'REJECTS', 'CANCELS');

-- AlterTable
ALTER TABLE "Project" DROP COLUMN "client",
DROP COLUMN "sector",
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "cost" DECIMAL(18,2),
ADD COLUMN     "designFirmId" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "osNumber" TEXT,
ADD COLUMN     "sectorId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL DEFAULT 'SPECIALIST',
    "discipline" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleInProject" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "disciplineId" TEXT,
    "designFirmId" TEXT,
    "responsibleId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "specialistId" TEXT,
    "analysisCodeId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "analyzedAt" TIMESTAMP(3),
    "inReviewSince" TIMESTAMP(3),
    "round" INTEGER NOT NULL DEFAULT 0,
    "externalUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTransition" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "action" "DocumentAction" NOT NULL,
    "fromStatus" "DocumentStatus",
    "toStatus" "DocumentStatus" NOT NULL,
    "analysisCodeId" TEXT,
    "analysisCodeTag" TEXT,
    "round" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT,
    "actorName" TEXT,
    "assignedToId" TEXT,
    "assignedToName" TEXT,
    "comment" TEXT,
    "dueAt" TIMESTAMP(3),
    "daysInPreviousStage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalRequest" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" "SignalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "dueAt" TIMESTAMP(3),
    "note" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "SignalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discipline" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignFirm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinatorName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignFirm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisCode" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "effect" "AnalysisEffect" NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Document_projectId_idx" ON "Document"("projectId");

-- CreateIndex
CREATE INDEX "Document_disciplineId_idx" ON "Document"("disciplineId");

-- CreateIndex
CREATE INDEX "Document_responsibleId_idx" ON "Document"("responsibleId");

-- CreateIndex
CREATE INDEX "Document_number_idx" ON "Document"("number");

-- CreateIndex
CREATE INDEX "DocumentRevision_documentId_sequence_idx" ON "DocumentRevision"("documentId", "sequence");

-- CreateIndex
CREATE INDEX "DocumentRevision_status_idx" ON "DocumentRevision"("status");

-- CreateIndex
CREATE INDEX "DocumentRevision_specialistId_status_idx" ON "DocumentRevision"("specialistId", "status");

-- CreateIndex
CREATE INDEX "DocumentRevision_dueAt_idx" ON "DocumentRevision"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRevision_documentId_name_key" ON "DocumentRevision"("documentId", "name");

-- CreateIndex
CREATE INDEX "DocumentTransition_revisionId_createdAt_idx" ON "DocumentTransition"("revisionId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentTransition_assignedToId_idx" ON "DocumentTransition"("assignedToId");

-- CreateIndex
CREATE INDEX "SignalRequest_assigneeId_status_idx" ON "SignalRequest"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "SignalRequest_status_dueAt_idx" ON "SignalRequest"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignalRequest_milestoneId_assigneeId_key" ON "SignalRequest"("milestoneId", "assigneeId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_name_key" ON "Sector"("name");

-- CreateIndex
CREATE INDEX "Sector_isActive_idx" ON "Sector"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_tag_key" ON "Discipline"("tag");

-- CreateIndex
CREATE INDEX "Discipline_isActive_idx" ON "Discipline"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DesignFirm_name_key" ON "DesignFirm"("name");

-- CreateIndex
CREATE INDEX "DesignFirm_isActive_idx" ON "DesignFirm"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCode_tag_key" ON "AnalysisCode"("tag");

-- CreateIndex
CREATE INDEX "AnalysisCode_isActive_sortOrder_idx" ON "AnalysisCode"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Project_managerId_idx" ON "Project"("managerId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "Project_sectorId_idx" ON "Project"("sectorId");

-- CreateIndex
CREATE INDEX "Project_designFirmId_idx" ON "Project"("designFirmId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_designFirmId_fkey" FOREIGN KEY ("designFirmId") REFERENCES "DesignFirm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "Discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_designFirmId_fkey" FOREIGN KEY ("designFirmId") REFERENCES "DesignFirm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_specialistId_fkey" FOREIGN KEY ("specialistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_analysisCodeId_fkey" FOREIGN KEY ("analysisCodeId") REFERENCES "AnalysisCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTransition" ADD CONSTRAINT "DocumentTransition_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRequest" ADD CONSTRAINT "SignalRequest_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalRequest" ADD CONSTRAINT "SignalRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
