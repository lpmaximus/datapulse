
import Link from "next/link";
import clsx from "clsx";
import { Empty } from "@/components/ui";
import { ClickableRow } from "@/components/clickable-row";
import { RequestQuickAdd, type RequestQuickAddConfig } from "@/components/request-quick-add";
import { Th, Td } from "@/components/table-ui";
import { RequestStatusCell } from "@/components/task-ui";
import { RequestRescheduleForm, ResolveRequestButton, DismissRequestButton } from "@/components/request-forms";
import { DeleteButton } from "@/components/delete-button";
import { deleteRequest } from "@/app/actions/requests";
import { isRequestOverdue } from "@/lib/requests";
import { formatDate } from "@/lib/format";
import type { RequestRow } from "@/types/models";

/** Tabela de solicitações — usada no projeto (todas) e na tarefa/marco (as dela). */
export function RequestTable({
  requests,
  now,
  projectId,
  writable,
  manage,
  currentUserId,
  showLink = true,
  openMode = "modal",
  quickAdd,
}: {
  requests: RequestRow[];
  now: Date;
  projectId: string;
  writable: boolean;
  manage: boolean;
  currentUserId: string;
  /** Mostra a coluna "Vínculo" — desligue quando já está na página da tarefa. */
  showLink?: boolean;
  /** Linha de cadastro direto ao final da lista. Com ela, a tabela aparece mesmo vazia. */
  quickAdd?: RequestQuickAddConfig;
  /** Clique na linha: pop-up na própria página, ou navegar para a tela completa. */
  openMode?: "modal" | "page";
}) {
  if (requests.length === 0 && !quickAdd) {
    return <Empty>Nenhuma solicitação registrada.</Empty>;
  }
  return (
    <div className="dp-scroll overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse">
        <thead className="bg-canvas">
          <tr>
            <Th className="min-w-[240px] pl-4">Solicitação</Th>
            <Th>Depende de</Th>
            <Th>Responsável</Th>
            <Th className="w-[110px]">Status</Th>
            <Th className="w-[150px]">Prazo</Th>
            {showLink ? <Th>Vínculo</Th> : null}
            <Th align="right">Ações</Th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const late = isRequestOverdue(r, now);
            const isOwner = r.owner?.id === currentUserId;
            const canResolve = writable && r.status === "PENDING" && (manage || isOwner);
            const canDismiss = writable && r.status === "PENDING" && manage;
            const canDelete = writable && (manage || isOwner);
            return (
              <ClickableRow
                key={r.id}
                {...(openMode === "modal"
                  ? { openParam: "request" as const, openId: r.id }
                  : { href: `/projects/${projectId}/requests/${r.id}` })}
                className="border-t border-line hover:bg-canvas/60"
              >
                <Td className="max-w-[320px] pl-4">
                  <p className="truncate text-ink">{r.description}</p>
                  {r.type ? <p className="truncate text-xs text-ink-faint">{r.type}</p> : null}
                  {r.documents.length > 0 ? (
                    <p className="truncate text-xs text-ink-faint">
                      {r.documents.map((d) => d.document.number ?? d.document.name).join(", ")}
                    </p>
                  ) : null}
                </Td>
                <Td className="text-ink-soft">{r.waitingOn ?? "—"}</Td>
                <Td className="text-ink-soft">{r.owner?.name ?? "—"}</Td>
                <td className="h-px border-l border-line p-0">
                  <RequestStatusCell status={r.status} />
                </td>
                <Td>
                  <span className={clsx("tabular-nums", late ? "text-st-stuck" : "text-ink-soft")}>
                    {formatDate(r.dueAt)}
                  </span>
                  {canResolve ? (
                    <div className="mt-0.5">
                      <RequestRescheduleForm requestId={r.id} />
                    </div>
                  ) : null}
                </Td>
                {showLink ? (
                  <Td>
                    {r.milestone ? (
                      <Link href={`/projects/${projectId}/tasks/${r.milestone.id}`} className="text-accent hover:underline">
                        {r.milestone.name}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">projeto</span>
                    )}
                  </Td>
                ) : null}
                <Td align="right">
                  <div className="flex items-center justify-end gap-3">
                    {canResolve ? <ResolveRequestButton requestId={r.id} /> : null}
                    {canDismiss ? <DismissRequestButton requestId={r.id} /> : null}
                    {canDelete ? (
                      <DeleteButton
                        compact
                        action={deleteRequest}
                        idField="requestId"
                        id={r.id}
                        confirm="Excluir esta solicitação?"
                      />
                    ) : null}
                  </div>
                </Td>
              </ClickableRow>
            );
          })}
          {requests.length === 0 ? (
            <tr className="border-t border-line">
              <td colSpan={99} className="py-3 pl-4 text-sm text-ink-faint">
                Nenhuma solicitação registrada.
              </td>
            </tr>
          ) : null}
          {quickAdd ? <RequestQuickAdd projectId={projectId} showLink={showLink} {...quickAdd} /> : null}
        </tbody>
      </table>
    </div>
  );
}
