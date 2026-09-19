import { requireUser } from "@/lib/authz";
import { RequestDetail } from "@/components/request-detail";

export const dynamic = "force-dynamic";

export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  const user = await requireUser(`/projects/${id}/requests/${requestId}`);
  return <RequestDetail id={id} requestId={requestId} user={user} />;
}
