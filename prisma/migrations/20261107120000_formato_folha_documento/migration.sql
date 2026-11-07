-- CreateEnum
CREATE TYPE "SheetFormat" AS ENUM ('A4', 'A3', 'A2', 'A1', 'A0');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "sheetFormat" "SheetFormat";
