"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createUser, type UserFormState } from "@/app/actions/users";
import { Button, Field, inputClass } from "@/components/ui";
import type { JobFunctionRow, EmpresaRow } from "@/types/models";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Criando…" : "Criar usuário"}
    </Button>
  );
}

export function UserCreateForm({
  functions,
  companies,
}: {
  functions: JobFunctionRow[];
  companies: EmpresaRow[];
}) {
  const [state, formAction] = useActionState<UserFormState, FormData>(createUser, {});

  return (
    <div className="space-y-4">
      <form action={formAction} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome">
          <input name="name" required className={inputClass} placeholder="Maria Silva" />
        </Field>
        <Field label="E-mail">
          <input
            name="email"
            type="email"
            required
            className={inputClass}
            placeholder="maria@empresa.com"
          />
        </Field>
        <Field label="Papel">
          <select name="role" defaultValue="SPECIALIST" className={inputClass}>
            <option value="SPECIALIST">Especialista — responde avaliações</option>
            <option value="MANAGER">Gerente — cria projetos e convoca</option>
            <option value="EXECUTIVE">Executivo — só visualiza</option>
            <option value="ADMIN">Administrador — acesso total</option>
          </select>
        </Field>
        <Field label="Função" hint="Cargo do usuário — cadastrado em Cadastros.">
          <select name="functionId" defaultValue="" className={inputClass}>
            <option value="">Sem função definida</option>
            {functions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Empresa" hint="Empresa a que o usuário pertence — cadastrada em Cadastros.">
          <select name="companyId" defaultValue="" className={inputClass}>
            <option value="">Sem empresa</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <SubmitButton />
        </div>
      </form>

      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {state.error}
        </p>
      ) : null}

      {state.ok && state.temporaryPassword ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-medium">
            Usuário {state.userName} criado. Senha provisória:
          </p>
          <p className="mt-2 select-all rounded border border-green-300 bg-white px-3 py-2 font-mono text-base text-ink">
            {state.temporaryPassword}
          </p>
          <p className="mt-2 text-xs">
            Anote agora — esta senha não é armazenada em texto e não poderá ser
            exibida de novo. O usuário será obrigado a trocá-la no primeiro acesso.
          </p>
        </div>
      ) : null}
    </div>
  );
}
