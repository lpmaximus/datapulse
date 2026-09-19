"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createRequest, type RequestFormState } from "@/app/actions/requests";
import { inputClass } from "@/components/ui";

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
 * Cadastro direto na lista de solicitações: o pedido, de quem se espera a
 * resposta e o prazo. Tipo, responsável interno e documentos se completam na
 * tela da solicitação, ou pelo formulário completo.
 *
 * `milestoneId` pré-vincula à tarefa quando a lista está na tela dela.
 */
export function RequestQuickAdd({
  projectId,
  milestoneId,
}: {
  projectId: string;
  milestoneId?: string;
}) {
  const [state, action] = useActionState<RequestFormState, FormData>(createRequest, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    form.reset();
    form.querySelector<HTMLInputElement>('input[name="description"]')?.focus();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2 py-1">
      <input type="hidden" name="projectId" value={projectId} />
      {milestoneId ? <input type="hidden" name="milestoneId" value={milestoneId} /> : null}
      <input
        name="description"
        required
        aria-label="Solicitação"
        placeholder="+ Nova solicitação — descreva o pedido e tecle Enter"
        className={inputClass + " min-w-[260px] flex-1"}
      />
      <input name="waitingOn" aria-label="Depende de (terceiro)" placeholder="Depende de (Cliente, Empresa X…)" className={inputClass + " w-56"} />
      <input type="date" name="dueAt" aria-label="Prazo" className={inputClass + " w-40"} />
      <AddButton />
      {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
      {state.ok && !state.error ? <span className="text-sm text-green-700">Solicitação registrada.</span> : null}
    </form>
  );
}
