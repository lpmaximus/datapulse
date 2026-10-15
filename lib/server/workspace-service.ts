import { prisma } from "@/lib/prisma";
import { resolveWorkspaceRole, type WorkspaceRole } from "@/lib/workspaces";

export interface WorkspaceOption {
  id: string;
  name: string;
  /// Papel do usuário nesse workspace.
  role: WorkspaceRole;
  isHome: boolean;
}

/**
 * Workspaces que o usuário pode abrir: superadmin → todos os ativos;
 * demais → origem + memberships. Exclui onde o papel é EXTERNAL (sem acesso).
 */
export async function listAccessibleWorkspaces(userId: string): Promise<WorkspaceOption[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organizationId: true,
      role: true,
      isSuperAdmin: true,
      workspaceMemberships: { select: { organizationId: true, role: true } },
    },
  });
  if (!user) return [];

  const access = {
    homeOrganizationId: user.organizationId,
    homeRole: user.role,
    isSuperAdmin: user.isSuperAdmin,
    memberships: user.workspaceMemberships,
  };

  const ids = user.isSuperAdmin
    ? undefined
    : [user.organizationId, ...user.workspaceMemberships.map((m) => m.organizationId)];

  const orgs = await prisma.organization.findMany({
    where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const out: WorkspaceOption[] = [];
  for (const org of orgs) {
    const role = resolveWorkspaceRole(access, org.id);
    if (!role || role === "EXTERNAL") continue;
    out.push({ id: org.id, name: org.name, role, isHome: org.id === user.organizationId });
  }
  return out;
}
