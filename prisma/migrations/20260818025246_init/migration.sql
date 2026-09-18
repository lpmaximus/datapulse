-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "SignalSource" AS ENUM ('CSV', 'XLSX', 'GOOGLE_SHEETS', 'ACC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CLOSED');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "client" TEXT,
    "sector" TEXT,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "externalRef" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "economicImpact" DECIMAL(18,2),
    "plannedDate" TIMESTAMP(3),
    "forecastDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemicSignal" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "source" "SignalSource" NOT NULL DEFAULT 'CSV',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plannedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "delayDays" INTEGER,
    "plannedCost" DECIMAL(18,2),
    "actualCost" DECIMAL(18,2),
    "openIssues" INTEGER,
    "replanCount" INTEGER,
    "raw" JSONB,

    CONSTRAINT "SystemicSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanSignal" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "respondentHash" TEXT NOT NULL,
    "respondentRole" TEXT,
    "failureProbability" INTEGER NOT NULL,
    "planConfidence" INTEGER NOT NULL,
    "perceivedBottleneck" TEXT,
    "blockedDecision" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DRIScore" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "humanScore" DOUBLE PRECISION,
    "systemicScore" DOUBLE PRECISION,
    "breakdown" JSONB NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DRIScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "Milestone_projectId_idx" ON "Milestone"("projectId");

-- CreateIndex
CREATE INDEX "Milestone_projectId_criticality_idx" ON "Milestone"("projectId", "criticality");

-- CreateIndex
CREATE INDEX "SystemicSignal_milestoneId_referenceDate_idx" ON "SystemicSignal"("milestoneId", "referenceDate");

-- CreateIndex
CREATE INDEX "SystemicSignal_source_idx" ON "SystemicSignal"("source");

-- CreateIndex
CREATE INDEX "HumanSignal_milestoneId_createdAt_idx" ON "HumanSignal"("milestoneId", "createdAt");

-- CreateIndex
CREATE INDEX "HumanSignal_respondentHash_idx" ON "HumanSignal"("respondentHash");

-- CreateIndex
CREATE INDEX "DRIScore_projectId_calculatedAt_idx" ON "DRIScore"("projectId", "calculatedAt");

-- CreateIndex
CREATE INDEX "DRIScore_milestoneId_calculatedAt_idx" ON "DRIScore"("milestoneId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemicSignal" ADD CONSTRAINT "SystemicSignal_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanSignal" ADD CONSTRAINT "HumanSignal_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRIScore" ADD CONSTRAINT "DRIScore_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DRIScore" ADD CONSTRAINT "DRIScore_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
