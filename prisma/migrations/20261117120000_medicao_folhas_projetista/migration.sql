-- AlterTable
ALTER TABLE "MeasurementItem" ADD COLUMN     "assigneeName" TEXT,
ADD COLUMN     "documentSheetCount" INTEGER;

-- Linhas de formato já gravadas mediam o documento inteiro.
UPDATE "MeasurementItem" SET "documentSheetCount" = "sheetCount" WHERE "kind" = 'FORMAT';
