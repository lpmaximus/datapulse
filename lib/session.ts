import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await prisma.session.create({
    data: {
      userId,
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
}

/** Usuário da requisição atual, ou null. Não lança — quem exige usa requireUser. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          function: { select: { name: true } },
          organizationId: true,
          organization: { select: { name: true } },
          isActive: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  // Usuário desativado perde acesso imediatamente, sem esperar a sessão expirar.
  if (!session.user.isActive) return null;

  const { isActive: _ignored, function: fn, organization, ...rest } = session.user;
  return {
    ...rest,
    functionName: fn?.name ?? null,
    organizationName: organization.name,
  } satisfies SessionUser;
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
