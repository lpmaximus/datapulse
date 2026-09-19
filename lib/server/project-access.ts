import { prisma } from "@/lib/prisma";
import { projectVisibility } from "@/lib/visibility";

/** O usuário enxerga este projeto? (mesma regra de `projectVisibility`) */
export async function canSeeProject(
  user: { id: string; role: string; organizationId: string },
  projectId: string,
): Promise<boolean> {
  const count = await prisma.project.count({
    where: { id: projectId, ...projectVisibility(user) },
  });
  return count > 0;
}
