import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateProject } from "@/app/actions/projects";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
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
  "datas-invalidas": "O término previsto não pode ser anterior ao início.",
};

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const me = await requireRole(["ADMIN", "MANAGER"], `/projects/${id}/edit`);
  const { error } = await searchParams;

  const project = await prisma.project.findFirst({
    where: { id, organizationId: me.organizationId },
    select: {
      id: true,
      name: true,
      osNumber: true,
      cost: true,
      clientId: true,
      sectorId: true,
      designFirmId: true,
      managerId: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  });
  if (!project) notFound();
  // Pausado/encerrado é somente leitura em todo o sistema.
  if (!isProjectWritable(project.status)) redirect(`/projects/${id}`);

  const options = await loadProjectFormOptions(me.organizationId, project);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {project.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Editar projeto</h1>
      </div>

      <Card>
        {error && ERROR_MESSAGE[error] ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {ERROR_MESSAGE[error]}
          </p>
        ) : null}
        <ProjectForm
          action={updateProject}
          hiddenId={project.id}
          options={options}
          values={{
            name: project.name,
            osNumber: project.osNumber,
            cost: project.cost != null ? String(Number(project.cost)) : "",
            clientId: project.clientId,
            sectorId: project.sectorId,
            designFirmId: project.designFirmId,
            managerId: project.managerId,
            startsAt: isoDay(project.startsAt),
            endsAt: isoDay(project.endsAt),
          }}
          submitLabel="Salvar alterações"
          cancelHref={`/projects/${id}`}
        />
      </Card>
    </div>
  );
}
