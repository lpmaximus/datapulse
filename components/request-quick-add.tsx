"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createRequest, type RequestFormState } from "@/app/actions/requests";
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

export interface RequestQuickAddConfig {
  /** Pré-vincula à tarefa quando a lista está na tela dela. */
  milestoneId?: string;
  users: UserOption[];
}

/**
 * Linha de entrada no fim da lista de solicitações, como uma linha em branco
 * de planilha: pedido, de quem depende, quem cobra e prazo, cada um na sua
 * coluna. Enter grava e o foco volta ao pedido. Tipo e documentos se completam
 * na tela da solicitação ou no formulário completo.
 */
export function RequestQuickAdd(props: RequestQuickAddConfig & { projectId: string; showLink: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddRowTrigger label="Nova solicitação" onClick={() => setOpen(true)} />;
  return <RequestEntryRow {...props} onClose={() => setOpen(false)} />;
}

function RequestEntryRow({
  projectId,
  milestoneId,
  users,
  showLink,
  onClose,
}: RequestQuickAddConfig & { projectId: string; showLink: boolean; onClose: () => void }) {
  const formId = useId();
  const [state, action, pending] = useActionState<RequestFormState, FormData>(createRequest, {});
  const rowRef = useRef<HTMLTableRowElement>(null);

  // Gravou: a linha vira registro da lista e a de entrada se fecha.
  useEffect(() => {
    if (state.at) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  useEffect(() => {
    rowRef.current?.querySelector<HTMLInputElement>('[name="description"]')?.focus();
  }, []);

  return (
    <>
      <tr ref={rowRef} className={entryRowClass} onKeyDown={onEntryKeyDown(onClose)}>
        <EntryCell>
          <form id={formId} action={action} className="hidden">
            <input type="hidden" name="projectId" value={projectId} />
            {milestoneId ? <input type="hidden" name="milestoneId" value={milestoneId} /> : null}
          </form>
          <div className="flex items-center">
            <Plus size={14} className="ml-3 shrink-0 text-ink-faint" aria-hidden />
            <input
              form={formId}
              name="description"
              required
              aria-label="Solicitação"
              placeholder="Nova solicitação — digite e tecle Enter"
              className={cellInput}
            />
          </div>
        </EntryCell>
        <EntryCell>
          <input form={formId} name="waitingOn" aria-label="Depende de (terceiro)" placeholder="Cliente, Empresa X…" className={cellInput} />
        </EntryCell>
        <EntryCell>
          <select form={formId} name="ownerId" defaultValue="" aria-label="Quem cobra" className={cellInput}>
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
          <input form={formId} type="date" name="dueAt" aria-label="Prazo" className={cellInput} />
        </EntryCell>
        {showLink ? <EntryBlank /> : null}
        <EntryCell>
          <div className="flex items-center">
            <EntryAddButton formId={formId} pending={pending} label="" />
            <EntryCancel onClick={onClose} />
          </div>
        </EntryCell>
      </tr>
      <EntryFeedback error={state.error} />
    </>
  );
}
