import { requireUser } from "@/lib/authz";
import { DocumentDetail } from "@/components/document-detail";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/documents/${id}`);
  return <DocumentDetail id={id} user={user} />;
}
