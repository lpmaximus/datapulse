import { prisma } from "@/lib/prisma";
import { PACKAGE_TYPE } from "@/lib/tasks";
import type { MarcoOption, PackageListRow, PackageOption } from "@/types/models";

/**
 * Pacotes de revisão que aceitam documento novo (não cancelados, dentro de um
 * marco). Com `projectId`, só os daquele projeto; sem ele (visão geral), os
 * dos projetos ativos da organização.
 */
export async function loadPackageOptions(
  organizationId: string,
  projectId?: string,
): Promise<PackageOption[]> {
  const rows = await prisma.milestone.findMany({
    where: {
      type: PACKAGE_TYPE,
      status: { not: "CANCELLED" },
      parentId: { not: null },
      project: projectId
        ? { id: projectId, organizationId }
        : { organizationId, status: "ACTIVE" },
    },
    orderBy: [{ project: { name: "asc" } }, { parent: { name: "asc" } }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      projectId: true,
      project: { select: { name: true } },
      parent: { select: { id: true, name: true } },
    },
  });
  return rows.flatMap((r) =>
    r.parent
      ? [
          {
            id: r.id,
            name: r.name,
            projectId: r.projectId,
            projectName: r.project.name,
            marcoId: r.parent.id,
            marcoName: r.parent.name,
          },
        ]
      : [],
  );
}

/** Marcos (nível raiz) do projeto, onde um pacote novo pode ser criado. */
export async function loadMarcoOptions(
  organizationId: string,
  projectId: string,
): Promise<MarcoOption[]> {
  return prisma.milestone.findMany({
    where: {
      projectId,
      kind: "MILESTONE",
      parentId: null,
      status: { not: "CANCELLED" },
      project: { organizationId },
    },
    orderBy: [{ plannedDate: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
}

/**
 * Todos os pacotes de revisão do projeto (inclusive cancelados), para a
 * lista de gestão em "Documentos" — editar (abre a tela da tarefa) e
 * excluir (só quando `_count.documentRevisions === 0`; `deleteTask`
 * confere isso de novo no servidor, esta contagem é só para a UI).
 */
export async function loadPackageList(
  organizationId: string,
  projectId: string,
): Promise<PackageListRow[]> {
  const rows = await prisma.milestone.findMany({
    where: { type: PACKAGE_TYPE, projectId, project: { organizationId } },
    orderBy: [{ parent: { name: "asc" } }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      status: true,
      progress: true,
      plannedDate: true,
      forecastDate: true,
      createdAt: true,
      parent: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      _count: { select: { documentRevisions: true } },
    },
  });
  // Pacote sempre tem marco pai (regra de negócio); o flatMap só descarta
  // um eventual registro legado sem isso, em vez de quebrar a tela.
  return rows.flatMap((r) =>
    r.parent
      ? [
          {
            id: r.id,
            name: r.name,
            status: r.status,
            progress: r.progress,
            plannedDate: r.plannedDate,
            forecastDate: r.forecastDate,
            createdAt: r.createdAt,
            marco: r.parent,
            assignee: r.assignee,
            _count: r._count,
          },
        ]
      : [],
  );
}
