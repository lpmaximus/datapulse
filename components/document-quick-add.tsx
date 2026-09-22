"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { createDocument, type DocumentFormState } from "@/app/actions/documents";
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
import { PackageSelect } from "@/components/package-select";
import { ColumnResizeHandle, MIN_COL_WIDTH } from "@/components/table-ui";
import type { DisciplineRow, PackageOption, ProjectOption } from "@/types/models";

/** Largura do campo Nº do documento, lembrada por navegador — mesmo padrão
 * de persistência das colunas de tabela (dp-colw2:), só que para essa
 * divisão interna (nº | nome) dentro da coluna "Documento". */
const NUMBER_WIDTH_KEY = "dp-colw2:document-quick-add-number";
const DEFAULT_NUMBER_WIDTH = 128; // era w-32 (8rem) fixo, agora é só o ponto de partida

function useNumberFieldWidth(): [number, (px: number) => void] {
  const [width, setWidth] = useState(DEFAULT_NUMBER_WIDTH);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NUMBER_WIDTH_KEY);
      const parsed = raw ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) setWidth(parsed);
    } catch {
      // localStorage indisponível — segue com o padrão.
    }
  }, []);
  function commit(px: number) {
    const next = Math.max(MIN_COL_WIDTH, Math.round(px));
    setWidth(next);
    try {
      window.localStorage.setItem(NUMBER_WIDTH_KEY, String(next));
    } catch {
      // idem — não é crítico persistir.
    }
  }
  return [width, commit];
}

export interface DocumentQuickAddConfig {
  /** Dentro de um projeto ele já é conhecido. */
  projectId?: string;
  /** Na visão geral o projeto é escolhido na própria linha. */
  projects?: ProjectOption[];
  /** Pacotes de revisão (Tarefas) onde o documento pode ser emitido — obrigatório escolher um. */
  packages: PackageOption[];
  disciplines: DisciplineRow[];
}

/**
 * Linha de entrada no fim da lista de documentos, como uma linha em branco de
 * planilha: nº e nome na coluna Documento, projeto, disciplina, revisão e prazo
 * cada um na sua coluna. Enter grava, a linha se limpa e o foco volta para o nº.
 * Projeto e disciplina ficam — quem digita uma lista costuma repeti-los.
 * O que faltar (empresa, emissor, link) se completa na tela do documento.
 */
export function DocumentQuickAdd(props: DocumentQuickAddConfig & { showProject: boolean }) {
  const [open, setOpen] = useState(false);
  if (!open) return <AddRowTrigger label="Novo documento" onClick={() => setOpen(true)} />;
  return <DocumentEntryRow {...props} onClose={() => setOpen(false)} />;
}

function DocumentEntryRow({
  projectId,
  projects,
  packages,
  disciplines,
  showProject,
  onClose,
}: DocumentQuickAddConfig & { showProject: boolean; onClose: () => void }) {
  const formId = useId();
  const [state, action, pending] = useActionState<DocumentFormState, FormData>(createDocument, {});
  const rowRef = useRef<HTMLTableRowElement>(null);
  const [numberWidth, setNumberWidth] = useNumberFieldWidth();

  // Gravou: a linha vira registro da lista e a de entrada se fecha.
  useEffect(() => {
    if (state.at) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  useEffect(() => {
    rowRef.current?.querySelector<HTMLInputElement>('[name="number"]')?.focus();
  }, []);

  return (
    <>
      <tr ref={rowRef} className={entryRowClass} onKeyDown={onEntryKeyDown(onClose)}>
        <EntryCell className="w-10 text-center">
          <form id={formId} action={action} className="hidden">
            {!showProject ? <input type="hidden" name="projectId" value={projectId ?? ""} /> : null}
          </form>
          <Plus size={14} className="mx-auto text-ink-faint" aria-hidden />
        </EntryCell>

        <EntryCell>
          <div className="flex">
            <div className="relative shrink-0" style={{ width: numberWidth }}>
              <input
                form={formId}
                name="number"
                aria-label="Nº do documento"
                placeholder="Nº"
                className={cellInput + " border-r border-line"}
              />
              <ColumnResizeHandle
                getStartWidth={(cell) => cell.getBoundingClientRect().width}
                onCommit={setNumberWidth}
              />
            </div>
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
            className={cellInput + " w-20! shrink-0 text-center font-mono text-xs"}
          />
        </EntryCell>

        <EntryBlank />
        <EntryBlank />
        <EntryCell>
          <PackageSelect
            form={formId}
            packages={packages}
            showProject={showProject}
            className={cellInput}
          />
        </EntryCell>
        <EntryBlank />

        <EntryCell>
          <div className="flex items-center">
            <input
              form={formId}
              type="date"
              name="dueAt"
              aria-label="Prazo da 1ª análise"
              className={cellInput + " w-36! shrink-0"}
            />
            <EntryAddButton formId={formId} pending={pending} label="" />
          </div>
        </EntryCell>
        <EntryCell className="w-10">
          <EntryCancel onClick={onClose} />
        </EntryCell>
      </tr>
      <EntryFeedback error={state.error} />
    </>
  );
}
