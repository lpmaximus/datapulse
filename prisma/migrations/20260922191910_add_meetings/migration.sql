-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "meetingFormCode" TEXT;

-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "meetingId" TEXT;

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "location" TEXT,
    "startTime" TEXT,
    "preparedBy" TEXT,
    "number" INTEGER,
    "subject" TEXT,
    "diverseSubjects" TEXT,
    "summary" TEXT,
    "externalUrl" TEXT,
    "teamsJoinUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "mode" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingTopic" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "responsible" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'INFORMATIVO',

    CONSTRAINT "MeetingTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_projectId_idx" ON "Meeting"("projectId");

-- CreateIndex
CREATE INDEX "Meeting_milestoneId_idx" ON "Meeting"("milestoneId");

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_idx" ON "MeetingParticipant"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingTopic_meetingId_idx" ON "MeetingTopic"("meetingId");

-- CreateIndex
CREATE INDEX "Request_meetingId_idx" ON "Request"("meetingId");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "Milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingTopic" ADD CONSTRAINT "MeetingTopic_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
