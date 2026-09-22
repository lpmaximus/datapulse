import { Lock } from "lucide-react";
import { ClickableRow } from "@/components/clickable-row";
import { DeleteButton } from "@/components/delete-button";
import { deleteTask } from "@/app/actions/tasks";
import { ResizableTable, Th, Td } from "@/components/table-ui";
import { Empty } from "@/components/ui";
import { Avatar, ProgressBar, TaskStatusCell } from "@/components/task-ui";
import { formatDate } from "@/lib/format";
import type { PackageListRow } from "@/types/models";

/**
 * Lista de gestão dos pacotes de revisão já criados no projeto — clique na
 * linha abre a tarefa (mesma tela de editar usada no cronograma: nome,
 * marco, responsável, prazo). Excluir só aparece em pacote sem revisão de
 * documento vinculada; com revisões, `deleteTask` já recusa no servidor —
 * aqui é só pra não oferecer uma ação que vai ser barrada.
 */
export function PackageList({ packages }: { packages: PackageListRow[] }) {
  if (packages.length === 0) {
    return (
      <div className="border-b border-line px-4 py-6">
        <Empty>Nenhum pacote de revisão criado ainda.</Empty>
      </div>
    );
  }

  return (
    <div className="dp-scroll overflow-x-auto border-b border-line">
      <ResizableTable id="project-packages" className="w-full border-collapse">
        <thead className="bg-surface">
          <tr>
            <Th className="min-w-[220px]">Pacote</Th>
            <Th className="min-w-[160px]">Marco</Th>
            <Th className="w-[140px]">Status</Th>
            <Th className="w-[140px]">Avanço</Th>
            <Th className="min-w-[150px]">Responsável</Th>
            <Th align="right">Documentos</Th>
            <Th className="w-[130px]">Prazo</Th>
            <Th className="w-10">
              <span className="sr-only">Excluir</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {packages.map((p) => {
            const docCount = p._count.documentRevisions;
            return (
              <ClickableRow
                key={p.id}
                openParam="task"
                openId={p.id}
                className="border-b border-line hover:bg-canvas"
              >
                <Td className="max-w-[320px]">
                  <span className="truncate text-ink">{p.name}</span>
                </Td>
                <Td className="text-ink-soft">{p.marco.name}</Td>
                <td className="h-px border-r border-line p-0">
                  <TaskStatusCell status={p.status} fill />
                </td>
                <Td>
                  <ProgressBar value={p.progress} />
                </Td>
                <Td className="text-center text-ink-soft">
                  {p.assignee ? (
                    <span className="inline-flex items-center gap-2" title={p.assignee.name}>
                      <Avatar name={p.assignee.name} size={24} />
                      <span className="max-w-[110px] truncate">{p.assignee.name}</span>
                    </span>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </Td>
                <Td align="right">{docCount}</Td>
                <Td className="text-ink-soft">{formatDate(p.forecastDate ?? p.plannedDate)}</Td>
                <Td className="w-10 text-center">
                  {docCount === 0 ? (
                    <DeleteButton
                      compact
                      action={deleteTask}
                      idField="taskId"
                      id={p.id}
                      confirm={`Excluir o pacote "${p.name}"? Sem volta.`}
                    />
                  ) : (
                    <span
                      className="inline-flex p-1.5 text-ink-faint"
                      title={`Tem ${docCount} revisão(ões) de documento — cancele-as para poder excluir.`}
                    >
                      <Lock size={14} />
                    </span>
                  )}
                </Td>
              </ClickableRow>
            );
          })}
        </tbody>
      </ResizableTable>
    </div>
  );
}
