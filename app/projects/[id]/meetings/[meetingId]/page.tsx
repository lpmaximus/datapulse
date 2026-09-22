import { requireUser } from "@/lib/authz";
import { MeetingDetail } from "@/components/meeting-detail";

export const dynamic = "force-dynamic";

export default async function MeetingPage({
  params,
}: {
  params: Promise<{ id: string; meetingId: string }>;
}) {
  const { id, meetingId } = await params;
  const user = await requireUser(`/projects/${id}/meetings/${meetingId}`);
  return <MeetingDetail id={id} meetingId={meetingId} user={user} />;
}
