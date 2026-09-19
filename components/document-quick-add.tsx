"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Plus } from "lucide-react";
import { createDocument, type DocumentFormState } from "@/app/actions/documents";
import {
  EntryAddButton,
  EntryBlank,
  EntryCell,
  EntryFeedback,
  cellInput,
  entryRowClass,
} from "@/components/grid-entry";
import type { DisciplineRow, ProjectOption } from "@/types/models";

export interface DocumentQuickAddConfig {
  /** Dentro de um projeto ele já é conhecido. */
  projectId?: string;
  /** Na visão geral o projeto é escolhido na própria linha. */
  projects?: ProjectOption[];
  disciplines: DisciplineRow[];
}

/**
 * Linha de entrada no fim da lista de documentos, como uma linha em branco de
 * planilha: nº e nome na coluna Documento, projeto, disciplina, revisão e prazo
 * cada um na sua coluna. Enter grava, a linha se limpa e o foco volta para o nº.
 * Projeto e disciplina ficam — quem digita uma lista costuma repeti-los.
 * O que faltar (empresa, emissor, link) se completa na tela do documento.
 */
export function DocumentQuickAdd({
  projectId,
  projects,
  disciplines,
  showProject,
}: DocumentQuickAddConfig & { showProject: boolean }) {
  const formId = useId();
  const [state, action, pending] = useActionState<DocumentFormState, FormData>(createDocument, {});
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!state.at) return;
    const row = rowRef.current;
    if (!row) return;
    for (const name of ["number", "name", "dueAt"]) {
      const el = row.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (el) el.value = "";
    }
    const rev = row.querySelector<HTMLInputElement>('[name="revisionName"]');
    if (rev) rev.value = "R00";
    row.querySelector<HTMLInputElement>('[name="number"]')?.focus();
  }, [state.at]);

  return (
    <>
      <tr ref={rowRef} className={entryRowClass}>
        <EntryCell className="w-10 text-center">
          <form id={formId} action={action} className="hidden">
            {!showProject ? <input type="hidden" name="projectId" value={projectId ?? ""} /> : null}
          </form>
          <Plus size={14} className="mx-auto text-ink-faint" aria-hidden />
        </EntryCell>

        <EntryCell>
          <div className="flex">
            <input
              form={formId}
              name="number"
              aria-label="Nº do documento"
              placeholder="Nº"
              className={cellInput + " w-32 border-r border-line"}
            />
            <input
              form={formId}
              name="name"
              required
              aria-label="Nome do documento"
              placeholder="Novo documento — digite e tecle Enter"
              className={cellInput + " flex-1"}
            />
          </div>
        </EntryCell>

        {showProject ? (
          <EntryCell>
            <select form={formId} name="projectId" required defaultValue="" aria-label="Projeto" className={cellInput}>
              <option value="">Projeto…</option>
              {(projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.osNumber ? `${p.osNumber} — ` : ""}
                  {p.name}
                </option>
              ))}
            </select>
          </EntryCell>
        ) : null}

        <EntryCell>
          <select form={formId} name="disciplineId" defaultValue="" aria-label="Disciplina" className={cellInput}>
            <option value="">—</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.id}>
                {d.tag}
              </option>
            ))}
          </select>
        </EntryCell>

        <EntryCell>
          <input
            form={formId}
            name="revisionName"
            defaultValue="R00"
            aria-label="Revisão inicial"
            className={cellInput + " w-20 text-center font-mono text-xs"}
          />
        </EntryCell>

        <EntryBlank />
        <EntryBlank />
        <EntryBlank />
        <EntryBlank />

        <EntryCell>
          <div className="flex items-center">
            <input
              form={formId}
              type="date"
              name="dueAt"
              aria-label="Prazo da 1ª análise"
              className={cellInput + " w-36"}
            />
            <EntryAddButton formId={formId} pending={pending} label="" />
          </div>
        </EntryCell>
      </tr>
      <EntryFeedback error={state.error} ok={state.created ? `Cadastrado: ${state.created}` : undefined} />
    </>
  );
}
