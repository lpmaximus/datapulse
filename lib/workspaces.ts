/**
 * Regras puras de acesso a workspaces (organizações). Sem Prisma/Next — testável.
 *
 * Um usuário chega a um workspace por três caminhos:
 *   1. é a organização de origem dele (`User.organizationId`, papel `User.role`);
 *   2. tem um `OrganizationMember` nela (papel próprio daquele workspace);
 *   3. é superadmin da plataforma — entra em qualquer workspace ativo como ADMIN.
 */

export type WorkspaceRole = "ADMIN" | "MANAGER" | "SPECIALIST" | "EXECUTIVE" | "EXTERNAL";

export interface WorkspaceAccess {
  homeOrganizationId: string;
  homeRole: WorkspaceRole;
  isSuperAdmin: boolean;
  memberships: { organizationId: string; role: WorkspaceRole }[];
}

/** Papel do usuário no workspace, ou null se não tem acesso. */
export function resolveWorkspaceRole(
  access: WorkspaceAccess,
  organizationId: string,
): WorkspaceRole | null {
  if (access.isSuperAdmin) return "ADMIN";
  const member = access.memberships.find((m) => m.organizationId === organizationId);
  if (member) return member.role;
  if (access.homeOrganizationId === organizationId) return access.homeRole;
  return null;
}

/**
 * Workspace usado quando a sessão não tem um escolhido (sessões antigas, criadas
 * antes de existir seleção). Quem tem uma única opção segue direto; quem tem
 * mais de uma — ou é superadmin — precisa escolher (retorna null).
 */
export function defaultWorkspaceId(access: WorkspaceAccess): string | null {
  if (access.isSuperAdmin) return null;
  const others = access.memberships.filter(
    (m) => m.organizationId !== access.homeOrganizationId,
  );
  return others.length === 0 ? access.homeOrganizationId : null;
}

/** Superadmin sempre passa pela tela (é onde cadastra workspace); os demais, só com 2+ opções. */
export function needsWorkspaceChoice(isSuperAdmin: boolean, accessibleCount: number): boolean {
  return isSuperAdmin || accessibleCount > 1;
}

/** Só aceita caminho interno ("/x") como destino pós-login — evita open redirect. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
