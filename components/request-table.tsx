
import Link from "next/link";
import clsx from "clsx";
import { Empty } from "@/components/ui";
import { Th, Td } from "@/components/table-ui";
import { RequestStatusCell } from "@/components/task-ui";
import { RequestRescheduleForm, ResolveRequestButton, DismissRequestButton } from "@/components/request-forms";
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
}: {
  requests: RequestRow[];
  now: Date;
  projectId: string;
  writable: boolean;
  manage: boolean;
  currentUserId: string;
  /** Mostra a coluna "Vínculo" — desligue quando já está na página da tarefa. */
  showLink?: boolean;
}) {
  if (requests.length === 0) {
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
            return (
              <tr key={r.id} className="border-t border-line hover:bg-canvas/60">
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
                  </div>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
