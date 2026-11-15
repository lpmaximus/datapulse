import { requireUser } from "@/lib/authz";
import { DocumentDetail } from "@/components/document-detail";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requireUser(`/documents/${id}`);
  return <DocumentDetail id={id} user={user} error={error} />;
}
