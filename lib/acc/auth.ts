import { encryptToken, decryptToken } from "./crypto";

/**
 * OAuth 2.0 3-legged do Autodesk Platform Services (APS).
 *
 * ATENÇÃO — correção factual em relação ao plano original:
 * a Data Connector API NÃO aceita token 2-legged (client credentials).
 * Só funciona com token 3-legged, e o usuário que autoriza precisa ser
 * Account Admin / Executive no ACC. Confirmado na documentação e no sample
 * oficial da Autodesk ("DC API supports 3-legged token only").
 *
 * Consequência prática: não existe "service account". Um humano autoriza uma
 * vez pelo navegador e o refresh token mantém o cron vivo — por até 15 dias
 * de inatividade.
 */

const APS_BASE = "https://developer.api.autodesk.com";
export const AUTH_URL = `${APS_BASE}/authentication/v2/authorize`;
export const TOKEN_URL = `${APS_BASE}/authentication/v2/token`;

/**
 * Escopos mínimos. `data:read` e `data:write` são exigidos pela Data Connector
 * (o "write" é para criar o request de extração, não para escrever no ACC —
 * o DataPulse permanece read-only quanto aos dados do cliente).
 * `account:read` é necessário para listar hubs e projetos.
 */
export const ACC_SCOPES = ["data:read", "data:write", "account:read"] as const;

/** Access token vive 60 min; renovamos com folga para não expirar em voo. */
const ACCESS_TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;
/** Refresh token vive 15 dias; avisamos antes de morrer. */
export const REFRESH_TOKEN_LIFETIME_DAYS = 15;
export const REFRESH_TOKEN_WARNING_DAYS = 4;

export interface AccTokenSet {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

export interface AccEncryptedTokens {
  accessTokenEnc: string;
  refreshTokenEnc: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não configurada.`);
  return v;
}

export function getClientId(): string {
  return requireEnv("APS_CLIENT_ID");
}

export function getCallbackUrl(): string {
  return requireEnv("APS_CALLBACK_URL");
}

/** URL para onde mandamos o usuário autorizar o acesso ao hub dele. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: getClientId(),
    redirect_uri: getCallbackUrl(),
    scope: ACC_SCOPES.join(" "),
    state,
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(
    `${getClientId()}:${requireEnv("APS_CLIENT_SECRET")}`,
  ).toString("base64");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Não vaza o corpo cru em produção: pode conter fragmentos de token.
    throw new Error(
      `APS token endpoint respondeu ${res.status}${
        process.env.NODE_ENV === "development" ? `: ${text.slice(0, 300)}` : ""
      }`,
    );
  }

  return (await res.json()) as TokenResponse;
}

function toTokenSet(r: TokenResponse, now = new Date()): AccTokenSet {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    accessTokenExpiresAt: new Date(now.getTime() + r.expires_in * 1000),
    refreshTokenExpiresAt: new Date(
      now.getTime() + REFRESH_TOKEN_LIFETIME_DAYS * 86_400_000,
    ),
  };
}

/** Troca o `code` do callback pelo primeiro par de tokens. */
export async function exchangeCodeForTokens(code: string): Promise<AccTokenSet> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getCallbackUrl(),
  });
  return toTokenSet(await postToken(body));
}

/**
 * Renova o par de tokens.
 *
 * O refresh token do APS é de uso único: cada chamada devolve um novo e
 * invalida o anterior. Quem chamar isto PRECISA persistir o resultado — se a
 * gravação falhar depois de um refresh bem-sucedido, a conexão fica órfã e
 * exige reautorização manual.
 */
export async function refreshTokens(refreshToken: string): Promise<AccTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: ACC_SCOPES.join(" "),
  });
  return toTokenSet(await postToken(body));
}

export function encryptTokenSet(tokens: AccTokenSet): AccEncryptedTokens {
  return {
    accessTokenEnc: encryptToken(tokens.accessToken),
    refreshTokenEnc: encryptToken(tokens.refreshToken),
    accessTokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
}

export function isAccessTokenExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() - ACCESS_TOKEN_SAFETY_MARGIN_MS <= now.getTime();
}

export function isRefreshTokenExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

/** Dias restantes até a conexão exigir reautorização humana. */
export function daysUntilReauth(expiresAt: Date, now = new Date()): number {
  return Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
}

export { decryptToken };
