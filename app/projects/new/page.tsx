import Link from "next/link";
import { createProject } from "@/app/actions/projects";
import { Card, Button, Field, inputClass } from "@/components/ui";

const ERROR_MESSAGE: Record<string, string> = {
  "nome-obrigatorio": "Informe o nome do projeto.",
};

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-ink-faint hover:text-ink-soft">
          ← Projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="mt-1 text-sm text-ink-soft">
          O DRI só aparece depois que houver marcos e sinais — comece pelo básico.
        </p>
      </div>

      <Card>
        {error && ERROR_MESSAGE[error] ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {ERROR_MESSAGE[error]}
          </p>
        ) : null}
        <form action={createProject} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Nome do projeto">
              <input
                name="name"
                required
                autoFocus
                className={inputClass}
                placeholder="Ex.: Subestação Norte — Fase 2"
              />
            </Field>
          </div>
          <Field label="Cliente">
            <input name="client" className={inputClass} placeholder="Opcional" />
          </Field>
          <Field label="Setor">
            <input name="sector" className={inputClass} placeholder="Engenharia, TI, Indústria…" />
          </Field>
          <Field label="Início">
            <input type="date" name="startsAt" className={inputClass} />
          </Field>
          <Field label="Término previsto">
            <input type="date" name="endsAt" className={inputClass} />
          </Field>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit">Criar projeto</Button>
            <Link href="/projects">
              <Button type="button" variant="outline">Cancelar</Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
