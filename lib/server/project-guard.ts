import { prisma } from "@/lib/prisma";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";

export { READONLY_MESSAGE };

/**
 * Projeto pausado ou encerrado é somente leitura.
 *
 * Checado no servidor, em cada ação que grava — esconder o formulário na tela
 * não basta, porque a Server Action continua chamável.
 *
 * `organizationId` é obrigatório: sem ele, um `projectId` de outra
 * organização (adivinhado ou reaproveitado de outra aba) passaria pela
 * checagem de "gravável" normalmente, mesmo pertencendo a outro tenant.
 */
export async function projectIsWritable(
  projectId: string,
  organizationId: string,
): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { status: true },
  });
  return isProjectWritable(project?.status);
}

export async function taskProjectIfWritable(
  milestoneId: string,
  organizationId: string,
): Promise<{ projectId: string; writable: boolean } | null> {
  const task = await prisma.milestone.findFirst({
    where: { id: milestoneId, project: { organizationId } },
    select: { projectId: true, project: { select: { status: true } } },
  });
  if (!task) return null;
  return { projectId: task.projectId, writable: isProjectWritable(task.project.status) };
}
