/*
  Warnings:

  - You are about to drop the column `discipline` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "discipline",
ADD COLUMN     "functionId" TEXT;

-- CreateTable
CREATE TABLE "JobFunction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobFunction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobFunction_name_key" ON "JobFunction"("name");

-- CreateIndex
CREATE INDEX "JobFunction_isActive_idx" ON "JobFunction"("isActive");

-- CreateIndex
CREATE INDEX "User_functionId_idx" ON "User"("functionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "JobFunction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
