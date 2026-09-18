import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { buildAuthorizeUrl } from "@/lib/acc/auth";
import { assertCryptoConfigured } from "@/lib/acc/crypto";
import { ACC_STATE_COOKIE, ACC_STATE_ORG_COOKIE } from "@/lib/acc/constants";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Início do fluxo de autorização do ACC.
 *
 * O `state` é aleatório e guardado em cookie httpOnly para ser conferido no
 * callback — sem isso, um terceiro poderia induzir a vinculação de um hub
 * que não é do usuário (CSRF no OAuth).
 *
 * Route handlers não passam pelo `requireRole` de `lib/authz` (que usa
 * `redirect()` de `next/navigation`, pensado para Server Components/Actions,
 * não para handlers de rota) — a checagem de sessão e papel é feita aqui,
 * direto com `getCurrentUser`.
 */
export async function GET() {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }
  if (user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/?error=sem-permissao", appUrl));
  }

  try {
    assertCryptoConfigured();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cifragem de token não configurada.",
      },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");

  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  jar.set(ACC_STATE_COOKIE, state, cookieOpts);
  // Guardado aqui — depois de já ter confirmado ADMIN acima — para o
  // callback saber a qual organização vincular o hub, sem precisar (e sem
  // poder) confiar em algo vindo do próprio cliente.
  jar.set(ACC_STATE_ORG_COOKIE, user.organizationId, cookieOpts);

  return NextResponse.redirect(buildAuthorizeUrl(state));
}
