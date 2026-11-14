-- CreateEnum
CREATE TYPE "MeasurementStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeasurementItemKind" AS ENUM ('FORMAT', 'OTHER');

-- AlterTable
ALTER TABLE "DocumentRevision" ADD COLUMN     "billable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billableNote" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "a1Price" DECIMAL(18,2),
ADD COLUMN     "seOsg" TEXT,
ADD COLUMN     "serviceNumber" TEXT;

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "previousId" TEXT,
    "periodLabel" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "status" "MeasurementStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedAmount" DECIMAL(18,2),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementItem" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "kind" "MeasurementItemKind" NOT NULL DEFAULT 'FORMAT',
    "revisionId" TEXT,
    "projectId" TEXT,
    "serviceNumber" TEXT,
    "seOsg" TEXT,
    "documentNumber" TEXT,
    "description" TEXT NOT NULL,
    "revisionName" TEXT,
    "executionDate" TIMESTAMP(3),
    "sheetFormat" "SheetFormat",
    "sheetCount" INTEGER NOT NULL DEFAULT 1,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT,
    "percent" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeasurementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementPayment" (
    "id" TEXT NOT NULL,
    "measurementId" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_previousId_key" ON "Measurement"("previousId");

-- CreateIndex
CREATE INDEX "Measurement_organizationId_status_idx" ON "Measurement"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Measurement_clientId_idx" ON "Measurement"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_organizationId_number_revision_key" ON "Measurement"("organizationId", "number", "revision");

-- CreateIndex
CREATE INDEX "MeasurementItem_measurementId_idx" ON "MeasurementItem"("measurementId");

-- CreateIndex
CREATE INDEX "MeasurementItem_revisionId_idx" ON "MeasurementItem"("revisionId");

-- CreateIndex
CREATE INDEX "MeasurementItem_projectId_idx" ON "MeasurementItem"("projectId");

-- CreateIndex
CREATE INDEX "MeasurementPayment_measurementId_idx" ON "MeasurementPayment"("measurementId");

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_previousId_fkey" FOREIGN KEY ("previousId") REFERENCES "Measurement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementItem" ADD CONSTRAINT "MeasurementItem_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementItem" ADD CONSTRAINT "MeasurementItem_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementItem" ADD CONSTRAINT "MeasurementItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementPayment" ADD CONSTRAINT "MeasurementPayment_measurementId_fkey" FOREIGN KEY ("measurementId") REFERENCES "Measurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
