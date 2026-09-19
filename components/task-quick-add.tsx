"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "@/app/actions/tasks";
import { PRIORITY_LABEL } from "@/lib/tasks";
import {
  AddRowTrigger,
  EntryAddButton,
  EntryBlank,
  EntryCancel,
  EntryCell,
  EntryFeedback,
  cellInput,
  entryRowClass,
  onEntryKeyDown,
} from "@/components/grid-entry";
import type { UserOption } from "@/types/models";

/**
 * Linha de entrada no fim da lista de tarefas, como uma linha em branco de
 * planilha: cada campo na sua coluna (nome, responsável, prioridade, início,
 * prazo, impacto). Enter grava e o foco volta ao nome. Responsável e
 * prioridade ficam para a próxima da série; marco e categoria se completam na
 * tela da tarefa ou no formulário completo.
 */
export function TaskQuickAdd({ projectId, users }: { projectId: string; users: UserOption[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddRowTrigger label="Nova tarefa" onClick={() => setOpen(true)} />;
  return <TaskEntryRow projectId={projectId} users={users} onClose={() => setOpen(false)} />;
}

function TaskEntryRow({
  projectId,
  users,
  onClose,
}: {
  projectId: string;
  users: UserOption[];
  onClose: () => void;
}) {
  const formId = useId();
  const [state, action, pending] = useActionState<TaskFormState, FormData>(createTask, {});
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Gravou: a linha vira registro da lista e a de entrada se fecha.
  useEffect(() => {
    if (state.at) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  useEffect(() => {
    rowRef.current?.querySelector<HTMLInputElement>('[name="name"]')?.focus();
  }, []);

  return (
    <>
      <tr ref={rowRef} className={entryRowClass} onKeyDown={onEntryKeyDown(onClose)}>
        <EntryCell>
          <form id={formId} action={action} className="hidden">
            <input type="hidden" name="projectId" value={projectId} />
          </form>
          <div className="flex items-center">
            <Plus size={14} className="ml-3 shrink-0 text-ink-faint" aria-hidden />
            <input
              form={formId}
              name="name"
              required
              aria-label="Nome da tarefa"
              placeholder="Nova tarefa — digite e tecle Enter"
              className={cellInput + " flex-1"}
            />
            <select form={formId} name="kind" defaultValue="TASK" aria-label="Tipo" className={cellInput + " w-24 border-l border-line"}>
              <option value="TASK">Tarefa</option>
              <option value="MILESTONE">Marco</option>
            </select>
          </div>
        </EntryCell>

        <EntryCell>
          <select form={formId} name="assigneeId" defaultValue="" aria-label="Responsável" className={cellInput}>
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </EntryCell>

        <EntryBlank />

        <EntryCell>
          <select form={formId} name="criticality" defaultValue="MEDIUM" aria-label="Prioridade" className={cellInput}>
            {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </EntryCell>

        <EntryBlank />

        <EntryCell>
          <input form={formId} type="date" name="startDate" aria-label="Início" className={cellInput} />
        </EntryCell>
        <EntryCell>
          <input form={formId} type="date" name="plannedDate" aria-label="Término planejado" className={cellInput} />
        </EntryCell>
        <EntryCell>
          <input
            form={formId}
            name="economicImpact"
            inputMode="numeric"
            aria-label="Impacto econômico"
            placeholder="Impacto"
            className={cellInput + " text-right"}
          />
        </EntryCell>
        <EntryCell>
          <EntryAddButton formId={formId} pending={pending} label="" />
        </EntryCell>
        <EntryCell className="w-10">
          <EntryCancel onClick={onClose} />
        </EntryCell>
      </tr>
      <EntryFeedback error={state.error} />
    </>
  );
}
