import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { exchangeCodeForTokens, encryptTokenSet } from "@/lib/acc/auth";
import { listHubs } from "@/lib/acc/data-connector";
import { upsertConnection } from "@/lib/acc/connection";
import { ACC_STATE_COOKIE, ACC_STATE_ORG_COOKIE } from "@/lib/acc/constants";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function fail(reason: string) {
  return NextResponse.redirect(
    new URL(
      `/settings/acc?error=${encodeURIComponent(reason)}`,
      process.env.APP_URL ?? "http://localhost:3000",
    ),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) return fail(`Autodesk recusou a autorização: ${oauthError}`);
  if (!code || !state) return fail("Resposta da Autodesk sem code ou state.");

  const jar = await cookies();
  const expected = jar.get(ACC_STATE_COOKIE)?.value;
  if (!expected || !safeEqual(expected, state)) {
    return fail("State inválido — a autorização foi reiniciada por segurança.");
  }
  // Gravado em /authorize só depois de confirmar ADMIN — nunca aceito
  // diretamente do cliente aqui, já que este endpoint é público (ver
  // middleware: o redirect da Autodesk pode chegar sem cookie de sessão).
  const organizationId = jar.get(ACC_STATE_ORG_COOKIE)?.value;
  jar.delete(ACC_STATE_COOKIE);
  jar.delete(ACC_STATE_ORG_COOKIE);

  if (!organizationId) {
    return fail("Sessão de autorização perdida — inicie a conexão novamente.");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Descobre o hub. A Data Connector opera por hub, então sem hub não há
    // o que sincronizar.
    const hubs = await listHubs(tokens.accessToken);
    if (hubs.length === 0) {
      return fail(
        "Nenhum hub ACC visível para este usuário. Verifique se o app do APS foi provisionado na conta ACC.",
      );
    }

    // MVP: um hub por instalação/organização, como o plano define ("escopo
    // mínimo: um projeto ACC específico").
    const hub = hubs[0];

    await upsertConnection({
      organizationId,
      hubId: hub.id,
      hubName: hub.name,
      tokens: encryptTokenSet(tokens),
    });

    return NextResponse.redirect(
      new URL("/settings/acc?connected=1", process.env.APP_URL ?? "http://localhost:3000"),
    );
  } catch (error) {
    console.error("[acc/callback] falha", error);
    return fail(
      error instanceof Error ? error.message.slice(0, 200) : "Falha ao concluir a autorização.",
    );
  }
}
