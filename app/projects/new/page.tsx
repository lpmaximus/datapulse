import Link from "next/link";
import { createProject } from "@/app/actions/projects";
import { requireRole } from "@/lib/authz";
import { Card } from "@/components/ui";
import { ProjectForm } from "@/components/project-form";
import { loadProjectFormOptions } from "@/lib/server/project-options";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE: Record<string, string> = {
  "nome-obrigatorio": "Informe o nome do projeto.",
  "cliente-invalido": "Cliente inválido.",
  "setor-invalido": "Setor inválido.",
  "empresa-invalida": "Empresa inválida.",
  "gerente-invalido": "Gerente inválido.",
};

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await requireRole(["ADMIN", "MANAGER"], "/projects/new");
  const { error } = await searchParams;
  const options = await loadProjectFormOptions(me.organizationId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/projects" className="text-xs text-ink-faint hover:text-ink-soft">
          ← Projetos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Novo projeto</h1>
        <p className="mt-1 text-sm text-ink-soft">
          O DRI só aparece depois que houver tarefas e sinais — comece pelo básico.
        </p>
      </div>

      <Card>
        {error && ERROR_MESSAGE[error] ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {ERROR_MESSAGE[error]}
          </p>
        ) : null}
        <ProjectForm
          action={createProject}
          options={options}
          submitLabel="Criar projeto"
          cancelHref="/projects"
          autoFocus
        />
      </Card>
    </div>
  );
}
