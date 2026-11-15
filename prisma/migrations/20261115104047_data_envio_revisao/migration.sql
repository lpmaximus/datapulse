-- CreateTable
CREATE TABLE "IssueDateChange" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3),
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssueDateChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IssueDateChange_revisionId_createdAt_idx" ON "IssueDateChange"("revisionId", "createdAt");

-- AddForeignKey
ALTER TABLE "IssueDateChange" ADD CONSTRAINT "IssueDateChange_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "DocumentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
