import { prisma } from "@/lib/prisma";
import {
  decryptToken,
  encryptTokenSet,
  isAccessTokenExpired,
  isRefreshTokenExpired,
  refreshTokens,
} from "./auth";

export interface AccConnectionRow {
  id: string;
  hubId: string;
  hubName: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  dataRequestId: string | null;
  lastJobId: string | null;
}

export class AccReauthRequiredError extends Error {
  constructor(public readonly connectionId: string) {
    super(
      "A autorização do ACC expirou. Um administrador da conta precisa reautorizar pelo navegador.",
    );
    this.name = "AccReauthRequiredError";
  }
}

/**
 * Devolve um access token válido, renovando se necessário.
 *
 * O refresh do APS é rotativo (uso único), então o novo par é persistido na
 * mesma operação em que é obtido. Se a gravação falhasse depois do refresh, o
 * token antigo já estaria invalidado e a conexão ficaria órfã.
 */
export async function getValidAccessToken(
  connection: AccConnectionRow,
  now = new Date(),
): Promise<string> {
  if (!isAccessTokenExpired(connection.accessTokenExpiresAt, now)) {
    return decryptToken(connection.accessTokenEnc);
  }

  if (isRefreshTokenExpired(connection.refreshTokenExpiresAt, now)) {
    await prisma.accConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncStatus: "REAUTH_REQUIRED",
        lastSyncError: "Refresh token expirou (15 dias sem uso).",
      },
    });
    throw new AccReauthRequiredError(connection.id);
  }

  let fresh;
  try {
    fresh = await refreshTokens(decryptToken(connection.refreshTokenEnc));
  } catch (error) {
    await prisma.accConnection.update({
      where: { id: connection.id },
      data: {
        lastSyncStatus: "REAUTH_REQUIRED",
        lastSyncError:
          error instanceof Error ? error.message.slice(0, 500) : "Falha no refresh.",
      },
    });
    throw new AccReauthRequiredError(connection.id);
  }

  await prisma.accConnection.update({
    where: { id: connection.id },
    data: encryptTokenSet(fresh),
  });

  return fresh.accessToken;
}

/**
 * Grava (ou substitui) a conexão de um hub após autorização bem-sucedida.
 *
 * `hubId` é único globalmente (identificador da Autodesk, não escolhido por
 * nós) — se por algum motivo já existir uma conexão com esse hub associada a
 * OUTRA organização, recusamos: sem essa checagem, o `upsert` reatribuiria
 * silenciosamente a conexão (e os tokens) de um tenant para outro.
 */
export async function upsertConnection(params: {
  hubId: string;
  hubName?: string | null;
  tokens: ReturnType<typeof encryptTokenSet>;
  organizationId: string;
  authorizedByHash?: string | null;
  authorizedByName?: string | null;
}) {
  const existing = await prisma.accConnection.findUnique({
    where: { hubId: params.hubId },
    select: { organizationId: true },
  });
  if (existing && existing.organizationId !== params.organizationId) {
    throw new Error("Este hub do ACC já está conectado a outra organização no DataPulse.");
  }

  return prisma.accConnection.upsert({
    where: { hubId: params.hubId },
    create: {
      organizationId: params.organizationId,
      hubId: params.hubId,
      hubName: params.hubName ?? null,
      ...params.tokens,
      authorizedByHash: params.authorizedByHash ?? null,
      authorizedByName: params.authorizedByName ?? null,
      lastSyncStatus: "NEVER_RUN",
      lastSyncError: null,
    },
    update: {
      hubName: params.hubName ?? null,
      ...params.tokens,
      authorizedByHash: params.authorizedByHash ?? null,
      authorizedByName: params.authorizedByName ?? null,
      lastSyncStatus: "NEVER_RUN",
      lastSyncError: null,
    },
  });
}
