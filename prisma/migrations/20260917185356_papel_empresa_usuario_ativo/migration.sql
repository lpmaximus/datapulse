/*
  Warnings:

  - You are about to drop the `DesignFirm` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_designFirmId_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_designFirmId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyId" TEXT;

-- DropTable
DROP TABLE "DesignFirm";

-- CreateTable
CREATE TABLE "Empresa" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coordinatorName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleProfile" (
    "role" "UserRole" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("role")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_name_key" ON "Empresa"("name");

-- CreateIndex
CREATE INDEX "Empresa_isActive_idx" ON "Empresa"("isActive");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_designFirmId_fkey" FOREIGN KEY ("designFirmId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_designFirmId_fkey" FOREIGN KEY ("designFirmId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;
