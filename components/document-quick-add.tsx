"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createDocument, type DocumentFormState } from "@/app/actions/documents";
import { inputClass } from "@/components/ui";
import type { DisciplineRow, ProjectOption } from "@/types/models";

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-strong disabled:opacity-50"
    >
      <Plus size={14} />
      {pending ? "Adicionando…" : "Adicionar"}
    </button>
  );
}

/**
 * Cadastro direto na lista: uma linha com o essencial (nº, nome, disciplina).
 * Enter adiciona e o foco volta ao nº para digitar o próximo. O restante —
 * empresa, emissor, prazo, link — se completa na tela do documento, ou pelo
 * formulário completo acima da lista.
 *
 * `projects` só existe na visão geral; dentro do projeto ele já é conhecido.
 */
export function DocumentQuickAdd({
  projectId,
  projects,
  disciplines,
}: {
  projectId?: string;
  projects?: ProjectOption[];
  disciplines: DisciplineRow[];
}) {
  const [state, action] = useActionState<DocumentFormState, FormData>(createDocument, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa só nº e nome: quem digita uma lista continua no mesmo projeto e disciplina.
  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    const number = form.querySelector<HTMLInputElement>('input[name="number"]');
    const name = form.querySelector<HTMLInputElement>('input[name="name"]');
    if (number) number.value = "";
    if (name) name.value = "";
    number?.focus();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2 py-1">
      {projects ? (
        <select name="projectId" required defaultValue="" aria-label="Projeto" className={inputClass + " w-52"}>
          <option value="">Projeto…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.osNumber ? `${p.osNumber} — ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="projectId" value={projectId ?? ""} />
      )}
      <input name="number" aria-label="Nº do documento" placeholder="Nº (PE-ELE-001)" className={inputClass + " w-40"} />
      <input name="name" required aria-label="Nome do documento" placeholder="+ Novo documento — digite o nome e tecle Enter" className={inputClass + " min-w-[240px] flex-1"} />
      <select name="disciplineId" defaultValue="" aria-label="Disciplina" className={inputClass + " w-44"}>
        <option value="">Disciplina…</option>
        {disciplines.map((d) => (
          <option key={d.id} value={d.id}>
            {d.tag} — {d.name}
          </option>
        ))}
      </select>
      <AddButton />
      {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
      {state.created && !state.error ? (
        <span className="text-sm text-green-700">Cadastrado: {state.created}</span>
      ) : null}
    </form>
  );
}
