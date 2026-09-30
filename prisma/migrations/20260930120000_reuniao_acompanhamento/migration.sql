-- Reunião criada a partir de outra: vínculo com a anterior e, em cada
-- tópico, a origem do item acompanhado.
ALTER TABLE "Meeting" ADD COLUMN "previousMeetingId" TEXT;
ALTER TABLE "MeetingTopic" ADD COLUMN "sourceTopicId" TEXT;

CREATE INDEX "Meeting_previousMeetingId_idx" ON "Meeting"("previousMeetingId");

ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_previousMeetingId_fkey" FOREIGN KEY ("previousMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
