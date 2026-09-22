"use client";

import { useActionState, useState } from "react";
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
  const [role, setRole] = useState("SPECIALIST");
  const external = role === "EXTERNAL";

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
        <Field
          label="Papel"
          hint={
            external
              ? "Sem acesso ao sistema: não recebe senha. Pode ser responsável por tarefas e é cobrado por e-mail."
              : undefined
          }
        >
          <select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            <option value="SPECIALIST">Especialista — responde avaliações</option>
            <option value="MANAGER">Gerente — cria projetos e convoca</option>
            <option value="EXECUTIVE">Executivo — só visualiza</option>
            <option value="ADMIN">Administrador — acesso total</option>
            <option value="EXTERNAL">Terceirizado / Projetista — sem acesso, só é cobrado</option>
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
        <Field
          label="Empresa"
          hint={
            external
              ? "Empresa projetista que ele representa — cadastrada em Cadastros."
              : "Empresa a que o usuário pertence — cadastrada em Cadastros."
          }
        >
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

      {state.ok && state.external ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-medium">Terceirizado {state.userName} cadastrado.</p>
          <p className="mt-1 text-xs">
            Sem senha e sem acesso ao sistema. Já pode ser escolhido como responsável
            de tarefas; a cobrança sai por e-mail a partir da tarefa.
          </p>
        </div>
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
