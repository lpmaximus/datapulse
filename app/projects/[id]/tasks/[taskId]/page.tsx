import { requireUser } from "@/lib/authz";
import { Modal } from "@/components/modal";
import { RequestDetail } from "@/components/request-detail";
import { TaskDetail } from "@/components/task-detail";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { id, taskId } = await params;
  const { request } = await searchParams;
  const user = await requireUser(`/projects/${id}/tasks/${taskId}`);

  return (
    <>
      <TaskDetail id={id} taskId={taskId} user={user} />
      {request ? (
        <Modal title="Solicitação" fullHref={`/projects/${id}/requests/${request}`}>
          <RequestDetail id={id} requestId={request} user={user} variant="modal" />
        </Modal>
      ) : null}
    </>
  );
}
