"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { updateUser, type UpdateUserFormState } from "@/app/actions/users";
import { Button, Field, inputClass } from "@/components/ui";
import type { JobFunctionRow } from "@/types/models";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  );
}

/**
 * Edita nome, e-mail e função — os campos do usuário que não têm controle
 * inline na lista (Papel, Empresa e Disciplinas já são editáveis na própria
 * linha). Aberto pelo pop-up `?user=<id>` (ver `components/modal.tsx`).
 */
export function UserEditForm({
  user,
  functions,
}: {
  user: { id: string; name: string; email: string; functionId: string | null };
  functions: JobFunctionRow[];
}) {
  const [state, formAction] = useActionState<UpdateUserFormState, FormData>(updateUser, {});

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="userId" value={user.id} />
        <Field label="Nome">
          <input name="name" required defaultValue={user.name} className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input name="email" type="email" required defaultValue={user.email} className={inputClass} />
        </Field>
        <Field label="Função" hint="Cargo do usuário — cadastrado em Cadastros.">
          <select name="functionId" defaultValue={user.functionId ?? ""} className={inputClass}>
            <option value="">Sem função definida</option>
            {functions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2">
          <SubmitButton />
          {state.ok ? <span className="text-sm text-green-700">Salvo.</span> : null}
        </div>
      </form>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
