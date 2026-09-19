"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Plus } from "lucide-react";
import { createTask, type TaskFormState } from "@/app/actions/tasks";
import { inputClass } from "@/components/ui";
import type { UserOption } from "@/types/models";

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
 * Cadastro direto na lista de tarefas: nome, tipo, responsável e término.
 * Prioridade, início, marco, categoria e impacto se completam na tela da
 * tarefa, ou pelo formulário completo abaixo da lista.
 */
export function TaskQuickAdd({ projectId, users }: { projectId: string; users: UserOption[] }) {
  const [state, action] = useActionState<TaskFormState, FormData>(createTask, {});
  const formRef = useRef<HTMLFormElement>(null);

  // Limpa só o nome e a data; responsável e tipo ficam para a próxima da série.
  useEffect(() => {
    if (!state.at) return;
    const form = formRef.current;
    if (!form) return;
    const name = form.querySelector<HTMLInputElement>('input[name="name"]');
    const date = form.querySelector<HTMLInputElement>('input[name="plannedDate"]');
    if (name) name.value = "";
    if (date) date.value = "";
    name?.focus();
  }, [state.at]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2 py-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="name"
        required
        aria-label="Nome da tarefa"
        placeholder="+ Nova tarefa — digite o nome e tecle Enter"
        className={inputClass + " min-w-[260px] flex-1"}
      />
      <select name="kind" defaultValue="TASK" aria-label="Tipo" className={inputClass + " w-28"}>
        <option value="TASK">Tarefa</option>
        <option value="MILESTONE">Marco</option>
      </select>
      <select name="assigneeId" defaultValue="" aria-label="Responsável" className={inputClass + " w-48"}>
        <option value="">Sem responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <input type="date" name="plannedDate" aria-label="Término planejado" className={inputClass + " w-40"} />
      <AddButton />
      {state.error ? <span className="text-sm text-red-700">{state.error}</span> : null}
      {state.ok && !state.error ? <span className="text-sm text-green-700">Tarefa adicionada.</span> : null}
    </form>
  );
}
