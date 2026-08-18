import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Identidade do respondente da Camada 2.
 *
 * Semana 1 do plano prevê Clerk. Enquanto as chaves não estiverem
 * configuradas, o app usa um identificador anônimo por cookie — suficiente
 * para o piloto interno e já no formato pseudonimizado final.
 *
 * Trocar por Clerk = implementar `getRespondentId` lendo `auth().userId`.
 * Nada mais no app conhece a identidade real do respondente.
 */

const COOKIE = "dp_respondent";

/** Pseudonimização: o banco nunca guarda e-mail nem id cru do provedor. */
export function hashRespondent(rawId: string): string {
  const salt = process.env.RESPONDENT_SALT ?? "datapulse-mvp-dev-salt";
  return createHash("sha256").update(`${salt}:${rawId}`).digest("hex").slice(0, 32);
}

export async function getRespondentHash(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return hashRespondent(existing);

  // Server Components não podem escrever cookie; a Server Action do
  // formulário cuida disso via `ensureRespondentCookie`.
  return hashRespondent("anonimo");
}

/** Chamar apenas de Server Action / Route Handler. */
export async function ensureRespondentCookie(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(COOKIE)?.value;
  if (!id) {
    id = randomUUID();
    jar.set(COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return hashRespondent(id);
}
