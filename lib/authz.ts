import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/session";

export type Role = SessionUser["role"];

/** Hierarquia de capacidades. ADMIN faz tudo que MANAGER faz, e assim por diante. */
export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SPECIALIST: "Especialista",
  EXECUTIVE: "Executivo",
};

/**
 * Descrição padrão de cada papel — usada como valor inicial do cadastro
 * `RoleProfile` (Settings > Cadastros > Papéis de acesso) e como texto de
 * apoio onde não houver override gravado no banco.
 */
export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: "Administra usuários e configurações da plataforma.",
  MANAGER: "Gerencia projetos, cria marcos e convoca avaliações.",
  SPECIALIST: "Responde a Camada 2 nos marcos em que foi convocado.",
  EXECUTIVE: "Visualiza painéis e relatórios; não opera nem responde.",
};

export function canManageUsers(user: SessionUser | null): boolean {
  return user?.role === "ADMIN";
}

export function canManageProjects(user: SessionUser | null): boolean {
  return user?.role === "ADMIN" || user?.role === "MANAGER";
}

export function canRespondSignals(user: SessionUser | null): boolean {
  return (
    user?.role === "ADMIN" || user?.role === "MANAGER" || user?.role === "SPECIALIST"
  );
}

/** Exige sessão. Redireciona para o login preservando o destino. */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  if (user.mustChangePassword) {
    redirect("/account/password?required=1");
  }
  return user;
}

export async function requireRole(roles: Role[], returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (!roles.includes(user.role)) {
    redirect("/?error=sem-permissao");
  }
  return user;
}
