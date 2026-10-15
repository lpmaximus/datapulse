"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspace, type WorkspaceFormState } from "@/app/actions/workspaces";
import { Button, Field, inputClass } from "@/components/ui";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Criando…" : "Criar workspace"}
    </Button>
  );
}

export function WorkspaceCreateForm() {
  const [state, formAction] = useActionState<WorkspaceFormState, FormData>(createWorkspace, {});

  return (
    <form action={formAction} className="space-y-3">
      <Field label="Nome do workspace">
        <input name="name" required className={inputClass} placeholder="IDG Engenharia" />
      </Field>
      <Field label="Nome do admin">
        <input name="adminName" className={inputClass} placeholder="Nome de quem vai administrar" />
      </Field>
      <Field label="E-mail do admin">
        <input name="adminEmail" type="email" required className={inputClass} placeholder="admin@empresa.com" />
      </Field>
      <p className="text-xs text-ink-soft">
        Se o e-mail já tem cadastro (inclusive o seu), ele ganha acesso de admin ao novo
        workspace com a senha que já usa; senão, é criado com senha provisória.
      </p>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.ok ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <p>
            Workspace <strong>{state.workspaceName}</strong> criado.
          </p>
          {state.temporaryPassword ? (
            <p className="mt-1">
              Admin <strong>{state.adminEmail}</strong> — senha provisória:{" "}
              <code className="rounded bg-white px-1.5 py-0.5 font-mono">{state.temporaryPassword}</code>
              <br />
              <span className="text-xs">
                Troca obrigatória no primeiro login. Repasse por canal seguro: ela não fica gravada.
              </span>
            </p>
          ) : (
            <p className="mt-1">
              <strong>{state.adminEmail}</strong> já tinha cadastro e agora é admin deste workspace.
            </p>
          )}
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
