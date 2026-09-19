import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { canManageProjects } from "@/lib/authz";
import type { SessionUser } from "@/lib/session";
import { DeleteButton } from "@/components/delete-button";
import { deleteRequest } from "@/app/actions/requests";
import { isProjectWritable } from "@/lib/tasks";
import { isRequestOpen, isRequestOverdue, daysOpen } from "@/lib/requests";
import { formatDate } from "@/lib/format";
import { Card, SectionTitle, Empty } from "@/components/ui";
import { Avatar, DeadlineHistoryList, ReadOnlyBanner, RequestStatusCell } from "@/components/task-ui";
import {
  DismissRequestButton,
  ReopenRequestButton,
  RequestEditForm,
  RequestRescheduleForm,
  ResolveRequestButton,
} from "@/components/request-forms";
import type { RequestDetailRow, UserOption } from "@/types/models";

/**
 * Conteúdo do registro de solicitação — tela completa (`variant="page"`) ou
 * pop-up da lista (`variant="modal"`).
 */
export async function RequestDetail({
  id,
  requestId,
  user,
  variant = "page",
}: {
  id: string;
  requestId: string;
  user: SessionUser;
  variant?: "page" | "modal";
}) {
  const modal = variant === "modal";

  const request: RequestDetailRow | null = await prisma.request.findFirst({
    where: { id: requestId, projectId: id, project: { organizationId: user.organizationId } },
    include: {
      project: { select: { id: true, name: true, status: true } },
      owner: { select: { id: true, name: true } },
      milestone: { select: { id: true, name: true } },
      documents: { include: { document: { select: { id: true, number: true, name: true } } } },
      deadlineChanges: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!request) return modal ? <Missing /> : notFound();

  const manage = canManageProjects(user);
  const writable = isProjectWritable(request.project.status);
  const isOwner = request.owner?.id === user.id;
  const canEdit = writable && (manage || isOwner);
  const open = isRequestOpen(request);

  // Cadastros do formulário de edição — só para quem pode editar.
  const [users, documentOptions, tasks]: [
    UserOption[],
    { id: string; number: string | null; name: string }[],
    { id: string; name: string }[],
  ] = canEdit
    ? await Promise.all([
        prisma.user.findMany({
          where: { isActive: true, organizationId: user.organizationId },
          select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
          orderBy: { name: "asc" },
        }),
        prisma.document.findMany({
          where: { projectId: id },
          select: { id: true, number: true, name: true },
          orderBy: [{ number: "asc" }, { name: "asc" }],
        }),
        prisma.milestone.findMany({
          where: { projectId: id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
      ])
    : [[], [], []];

  const now = new Date();
  const late = isRequestOverdue(request, now);
  const backHref = request.milestone
    ? `/projects/${id}/tasks/${request.milestone.id}`
    : `/projects/${id}`;

  return (
    <div className="space-y-8">
      <section>
        {!modal ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <Link href={`/projects/${id}`} className="hover:text-ink-soft">
            ← {request.project.name}
          </Link>
          {request.milestone ? (
            <>
              <span>/</span>
              <Link href={backHref} className="hover:text-ink-soft">
                {request.milestone.name}
              </Link>
            </>
          ) : null}
        </div>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">{request.description}</h1>
            <RequestStatusCell status={request.status} />
          </div>
          {canEdit ? (
            <div className="flex items-center gap-4">
              {open ? <ResolveRequestButton requestId={request.id} /> : null}
              {open && manage ? <DismissRequestButton requestId={request.id} /> : null}
              {!open && manage ? <ReopenRequestButton requestId={request.id} /> : null}
              <DeleteButton
                action={deleteRequest}
                idField="requestId"
                id={request.id}
                confirm="Excluir esta solicitação e o histórico de prazo dela?"
                returnTo={modal ? undefined : backHref}
              />
            </div>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Solicitação{request.type ? ` · ${request.type}` : ""}
        </p>
      </section>

      <ReadOnlyBanner status={request.project.status} projectId={id} canReactivate={manage} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Quem cobra</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={request.owner?.name} size={32} />
            <span className="text-sm font-medium">{request.owner?.name ?? "Sem responsável"}</span>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Depende de</p>
          <p className="mt-2 text-xl font-semibold">{request.waitingOn ?? "—"}</p>
          <p className="mt-1 text-xs text-ink-soft">Terceiro de quem se espera a resposta</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Prazo</p>
          <p className={clsx("mt-2 text-xl font-semibold tabular-nums", late && "text-st-stuck")}>
            {formatDate(request.dueAt)}
          </p>
          <div className="mt-1 text-xs text-ink-soft">
            {late ? "Atrasada" : open ? "No prazo" : "Encerrada"}
          </div>
          {open && canEdit ? (
            <div className="mt-2">
              <RequestRescheduleForm requestId={request.id} />
            </div>
          ) : null}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Andamento</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {open ? `${daysOpen(request, now)} dia(s) em aberto` : formatDate(request.resolvedAt)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            Registrada em {formatDate(request.createdAt)}
            {!open && request.resolvedAt ? " · encerrada nesta data" : ""}
          </p>
        </Card>
      </section>

      {canEdit ? (
        <section>
          <SectionTitle hint="O prazo se altera em “Reprogramar”, que guarda o histórico">
            Dados da solicitação
          </SectionTitle>
          <Card>
            <RequestEditForm
              request={{
                id: request.id,
                description: request.description,
                type: request.type,
                waitingOn: request.waitingOn,
                ownerId: request.owner?.id ?? null,
                milestoneId: request.milestone?.id ?? null,
                documentIds: request.documents.map((d) => d.document.id),
              }}
              users={users}
              documents={documentOptions}
              tasks={tasks}
            />
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint={`${request.documents.length} documento(s)`}>Documentos relacionados</SectionTitle>
          {request.documents.length === 0 ? (
            <Empty>Nenhum documento vinculado.</Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-line">
                {request.documents.map((d) => (
                  <li key={d.id} className="px-4 py-2.5 text-sm">
                    <Link href={`/documents/${d.document.id}`} className="text-ink hover:text-accent">
                      {d.document.number ? (
                        <span className="text-ink-faint">{d.document.number} · </span>
                      ) : null}
                      {d.document.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div>
          <SectionTitle hint="Reprogramações do prazo">Histórico de prazo</SectionTitle>
          <Card>
            <DeadlineHistoryList changes={request.deadlineChanges} />
          </Card>
        </div>
      </section>
    </div>
  );
}

function Missing() {
  return <p className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-faint">Registro não encontrado.</p>;
}
