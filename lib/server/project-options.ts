import { prisma } from "@/lib/prisma";

export type ProjectFormOptions = {
  managers: { id: string; name: string; function: { name: string } | null }[];
  clients: { id: string; name: string }[];
  sectors: { id: string; name: string }[];
  firms: { id: string; name: string; coordinatorName: string | null }[];
};

/**
 * Opções dos selects do formulário de projeto (criar e editar). Sempre
 * filtradas pela organização. Na edição, `keep` traz também o cadastro que o
 * projeto já usa mesmo se ele foi inativado depois — senão o select o
 * esconderia e salvar apagaria o vínculo sem ninguém pedir.
 */
export async function loadProjectFormOptions(
  organizationId: string,
  keep: { managerId?: string | null; clientId?: string | null; sectorId?: string | null; designFirmId?: string | null } = {},
): Promise<ProjectFormOptions> {
  const orKeep = (id?: string | null) => (id ? [{ id }] : []);
  const [managers, clients, sectors, firms] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId,
        OR: [{ isActive: true, role: { in: ["ADMIN", "MANAGER"] } }, ...orKeep(keep.managerId)],
      },
      select: { id: true, name: true, function: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.client.findMany({
      where: { organizationId, OR: [{ isActive: true }, ...orKeep(keep.clientId)] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.sector.findMany({
      where: { organizationId, OR: [{ isActive: true }, ...orKeep(keep.sectorId)] },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.empresa.findMany({
      where: { organizationId, OR: [{ isActive: true }, ...orKeep(keep.designFirmId)] },
      select: { id: true, name: true, coordinatorName: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { managers, clients, sectors, firms };
}
