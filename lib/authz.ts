import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/lib/session";

/** Papéis que entram no sistema (os únicos que uma sessão pode ter). */
export type Role = SessionUser["role"];

/**
 * Todos os papéis cadastráveis, incluindo `EXTERNAL` (Terceirizado /
 * Projetista), que existe como pessoa responsável por tarefas mas nunca faz
 * login. Usado nas telas de administração; permissão continua em `Role`.
 */
export type AccountRole = Role | "EXTERNAL";

export const ACCOUNT_ROLES: AccountRole[] = ["ADMIN", "MANAGER", "SPECIALIST", "EXECUTIVE", "EXTERNAL"];

/** Papel sem acesso ao sistema — só é cobrado. */
export function isExternalRole(role: string | null | undefined): boolean {
  return role === "EXTERNAL";
}

/** Hierarquia de capacidades. ADMIN faz tudo que MANAGER faz, e assim por diante. */
export const ROLE_LABEL: Record<AccountRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  SPECIALIST: "Especialista",
  EXECUTIVE: "Executivo",
  EXTERNAL: "Terceirizado / Projetista",
};

/**
 * Descrição padrão de cada papel — usada como valor inicial do cadastro
 * `RoleProfile` (Settings > Cadastros > Papéis de acesso) e como texto de
 * apoio onde não houver override gravado no banco.
 */
export const ROLE_DESCRIPTION: Record<AccountRole, string> = {
  ADMIN: "Administra usuários e configurações da plataforma.",
  MANAGER: "Gerencia projetos, cria marcos e convoca avaliações.",
  SPECIALIST: "Responde a Camada 2 nos marcos em que foi convocado.",
  EXECUTIVE: "Visualiza painéis e relatórios; não opera nem responde.",
  EXTERNAL: "Representante de empresa projetista. Não acessa o sistema; é responsável por tarefas e cobrado pela equipe.",
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

/**
 * Exige sessão e papel que grava. Executivo só lê: qualquer ação que altera
 * dado chama isto (ou `requireRole`), nunca `requireUser` sozinho.
 */
export async function requireWriter(returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);
  if (user.role === "EXECUTIVE") {
    redirect("/?error=sem-permissao");
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
