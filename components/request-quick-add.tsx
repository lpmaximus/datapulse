"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Plus } from "lucide-react";
import { createRequest, type RequestFormState } from "@/app/actions/requests";
import {
  EntryAddButton,
  EntryBlank,
  EntryCell,
  EntryFeedback,
  cellInput,
  entryRowClass,
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
export function RequestQuickAdd({
  projectId,
  milestoneId,
  users,
  showLink,
}: RequestQuickAddConfig & { projectId: string; showLink: boolean }) {
  const formId = useId();
  const [state, action, pending] = useActionState<RequestFormState, FormData>(createRequest, {});
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!state.at) return;
    const row = rowRef.current;
    if (!row) return;
    for (const name of ["description", "waitingOn", "dueAt"]) {
      const el = row.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el) el.value = "";
    }
    row.querySelector<HTMLInputElement>('[name="description"]')?.focus();
  }, [state.at]);

  return (
    <>
      <tr ref={rowRef} className={entryRowClass}>
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
          <EntryAddButton formId={formId} pending={pending} label="" />
        </EntryCell>
      </tr>
      <EntryFeedback error={state.error} ok={state.ok ? "Solicitação registrada." : undefined} />
    </>
  );
}
