/*
  Warnings:

  - The primary key for the `RoleProfile` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[organizationId,tag]` on the table `AnalysisCode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,name]` on the table `Client` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,tag]` on the table `Discipline` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,name]` on the table `Empresa` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,name]` on the table `JobFunction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[organizationId,name]` on the table `Sector` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `organizationId` to the `AccConnection` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `AnalysisCode` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Discipline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Empresa` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `JobFunction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `RoleProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `Sector` table without a default value. This is not possible if the table is not empty.
  - Added the required column `organizationId` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AnalysisCode_tag_key";

-- DropIndex
DROP INDEX "Client_name_key";

-- DropIndex
DROP INDEX "Discipline_tag_key";

-- DropIndex
DROP INDEX "Empresa_name_key";

-- DropIndex
DROP INDEX "JobFunction_name_key";

-- DropIndex
DROP INDEX "Sector_name_key";

-- AlterTable
ALTER TABLE "AccConnection" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "AnalysisCode" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Discipline" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "JobFunction" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RoleProfile" DROP CONSTRAINT "RoleProfile_pkey",
ADD COLUMN     "organizationId" TEXT NOT NULL,
ADD CONSTRAINT "RoleProfile_pkey" PRIMARY KEY ("organizationId", "role");

-- AlterTable
ALTER TABLE "Sector" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_name_key" ON "Organization"("name");

-- CreateIndex
CREATE INDEX "AccConnection_organizationId_idx" ON "AccConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCode_organizationId_tag_key" ON "AnalysisCode"("organizationId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_name_key" ON "Client"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Discipline_organizationId_tag_key" ON "Discipline"("organizationId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_organizationId_name_key" ON "Empresa"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "JobFunction_organizationId_name_key" ON "JobFunction"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Project_organizationId_idx" ON "Project"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_organizationId_name_key" ON "Sector"("organizationId", "name");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccConnection" ADD CONSTRAINT "AccConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discipline" ADD CONSTRAINT "Discipline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleProfile" ADD CONSTRAINT "RoleProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobFunction" ADD CONSTRAINT "JobFunction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisCode" ADD CONSTRAINT "AnalysisCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
