import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  defaultWorkspaceId,
  resolveWorkspaceRole,
  type WorkspaceAccess,
} from "@/lib/workspaces";

export const SESSION_COOKIE = "dp_session";
const SESSION_TTL_DAYS = 14;

/**
 * Sessão em banco, revogável.
 *
 * O cookie carrega o token cru; o banco guarda só o SHA-256. Um vazamento da
 * tabela de sessões não permite assumir a sessão de ninguém — diferente de um
 * JWT auto-contido, que também não seria revogável sem lista de bloqueio.
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * `organizationId` = workspace ativo. Nulo quando o usuário ainda precisa
 * escolher (mais de um acesso, ou superadmin): a sessão existe, mas
 * `getCurrentUser` devolve null até a escolha — só `getSessionIdentity` enxerga.
 */
export async function createSession(
  userId: string,
  userAgent?: string | null,
  organizationId: string | null = null,
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
      organizationId,
      tokenHash: hashToken(token),
      expiresAt,
      userAgent: userAgent?.slice(0, 200) ?? null,
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return { token, expiresAt };
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "SPECIALIST" | "EXECUTIVE";
  functionName: string | null;
  mustChangePassword: boolean;
  /// Multi-tenant: toda consulta de dados de negócio filtra por isto.
  organizationId: string;
  organizationName: string;
  /// Superadmin da plataforma (todos os workspaces + cadastro de workspace).
  isSuperAdmin: boolean;
  /// Tem mais de um workspace à disposição → mostra o seletor no menu.
  canSwitchWorkspace: boolean;
}

const SESSION_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isSuperAdmin: true,
  function: { select: { name: true } },
  organizationId: true,
  organization: { select: { name: true } },
  isActive: true,
  mustChangePassword: true,
  workspaceMemberships: { select: { organizationId: true, role: true } },
} as const;

async function loadSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      organizationId: true,
      user: { select: SESSION_USER_SELECT },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  // Usuário desativado perde acesso imediatamente, sem esperar a sessão expirar.
  if (!session.user.isActive) return null;
  return session;
}

function accessOf(user: NonNullable<Awaited<ReturnType<typeof loadSession>>>["user"]): WorkspaceAccess {
  return {
    homeOrganizationId: user.organizationId,
    homeRole: user.role,
    isSuperAdmin: user.isSuperAdmin,
    memberships: user.workspaceMemberships,
  };
}

/** Quem está logado, ainda sem workspace escolhido. Usado pela tela de seleção. */
export async function getSessionIdentity(): Promise<{
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
} | null> {
  const session = await loadSession();
  if (!session) return null;
  const { id, name, email, isSuperAdmin } = session.user;
  return { id, name, email, isSuperAdmin };
}

/**
 * Usuário da requisição atual no workspace ativo, ou null. Não lança — quem
 * exige usa requireUser. Sem workspace escolhido (e sem opção única) devolve
 * null: o fluxo cai em /login → /workspaces.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await loadSession();
  if (!session) return null;

  const { user } = session;
  const access = accessOf(user);

  // Sessões criadas antes da seleção de workspace não têm organizationId:
  // quem só tem um acesso continua entrando direto.
  const activeId = session.organizationId ?? defaultWorkspaceId(access);
  if (!activeId) return null;

  // O acesso é reavaliado a cada requisição: perder o vínculo com o workspace
  // derruba a sessão nele imediatamente.
  const role = resolveWorkspaceRole(access, activeId);
  // Terceirizado não tem acesso ao sistema — mesmo que uma sessão exista
  // (criada antes de o papel mudar), ela não vale.
  if (!role || role === "EXTERNAL") return null;

  let organizationName: string;
  if (activeId === user.organizationId) {
    organizationName = user.organization.name;
  } else {
    const org = await prisma.organization.findFirst({
      where: { id: activeId, isActive: true },
      select: { name: true },
    });
    if (!org) return null;
    organizationName = org.name;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    functionName: user.function?.name ?? null,
    mustChangePassword: user.mustChangePassword,
    organizationId: activeId,
    organizationName,
    isSuperAdmin: user.isSuperAdmin,
    canSwitchWorkspace: user.isSuperAdmin || user.workspaceMemberships.length > 0,
  } satisfies SessionUser;
}

/** Grava o workspace ativo na sessão atual. O chamador já validou o acesso. */
export async function setSessionWorkspace(organizationId: string): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { organizationId },
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Encerra todas as sessões de um usuário (troca de senha, desativação). */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

export async function purgeExpiredSessions(): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
  return count;
}
