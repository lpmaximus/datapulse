import Link from "next/link";
import { Button, Field, inputClass } from "@/components/ui";
import type { ProjectFormOptions } from "@/lib/server/project-options";

export type ProjectFormValues = {
  name?: string;
  osNumber?: string | null;
  cost?: string | number | null;
  clientId?: string | null;
  sectorId?: string | null;
  designFirmId?: string | null;
  managerId?: string | null;
  startsAt?: string | null; // yyyy-mm-dd
  endsAt?: string | null;
};

/** Formulário compartilhado por "Novo projeto" e "Editar projeto". */
export function ProjectForm({
  action,
  options,
  values = {},
  hiddenId,
  submitLabel,
  cancelHref,
  autoFocus,
}: {
  action: (formData: FormData) => Promise<void>;
  options: ProjectFormOptions;
  values?: ProjectFormValues;
  hiddenId?: string;
  submitLabel: string;
  cancelHref: string;
  autoFocus?: boolean;
}) {
  const { managers, clients, sectors, firms } = options;
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {hiddenId ? <input type="hidden" name="projectId" value={hiddenId} /> : null}
      <div className="sm:col-span-2">
        <Field label="Nome do projeto">
          <input
            name="name"
            required
            autoFocus={autoFocus}
            defaultValue={values.name ?? ""}
            className={inputClass}
            placeholder="Ex.: Subestação Norte — Fase 2"
          />
        </Field>
      </div>
      <Field label="Nº da OS">
        <input name="osNumber" defaultValue={values.osNumber ?? ""} className={inputClass} placeholder="OS-2026-014" />
      </Field>
      <Field label="Custo contratado">
        <input
          name="cost"
          inputMode="numeric"
          defaultValue={values.cost ?? ""}
          className={inputClass}
          placeholder="1500000"
        />
      </Field>

      <Field label="Cliente">
        <select name="clientId" defaultValue={values.clientId ?? ""} className={inputClass}>
          <option value="">Não definir</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Setor">
        <select name="sectorId" defaultValue={values.sectorId ?? ""} className={inputClass}>
          <option value="">Não definir</option>
          {sectors.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="sm:col-span-2">
        <Field label="Empresa" hint="Empresa/contratada responsável pelos projetos.">
          <select name="designFirmId" defaultValue={values.designFirmId ?? ""} className={inputClass}>
            <option value="">Não definir</option>
            {firms.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.coordinatorName ? ` — ${f.coordinatorName}` : ""}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Gerente do projeto" hint="Responsável por convocar avaliações e responder pelo DRI.">
          <select name="managerId" defaultValue={values.managerId ?? ""} className={inputClass}>
            <option value="">Definir depois</option>
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.function ? ` — ${m.function.name}` : ""}
              </option>
            ))}
          </select>
        </Field>
        {managers.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">
            Nenhum usuário com papel de Gerente ou Administrador cadastrado ainda. Crie um em Usuários.
          </p>
        ) : null}
      </div>
      <Field label="Início">
        <input type="date" name="startsAt" defaultValue={values.startsAt ?? ""} className={inputClass} />
      </Field>
      <Field label="Término previsto">
        <input type="date" name="endsAt" defaultValue={values.endsAt ?? ""} className={inputClass} />
      </Field>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit">{submitLabel}</Button>
        <Link href={cancelHref}>
          <Button type="button" variant="outline">Cancelar</Button>
        </Link>
      </div>
    </form>
  );
}
