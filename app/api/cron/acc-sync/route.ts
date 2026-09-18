import { NextResponse } from "next/server";
import { syncAllAccConnections } from "@/lib/acc/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronização diária com o Autodesk Construction Cloud.
 *
 * Roda antes do cron do DRI (ver vercel.json) para que o recálculo do dia já
 * enxergue os sinais recém-importados. O próprio sync já recalcula os projetos
 * que tocou — o cron do DRI cobre os demais.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const results = await syncAllAccConnections();

    const reauth = results.filter((r) => r.status === "REAUTH_REQUIRED");
    const failed = results.filter((r) => r.status === "FAILED");

    return NextResponse.json({
      ok: failed.length === 0,
      syncedAt: new Date().toISOString(),
      connections: results.length,
      needsReauth: reauth.length,
      failures: failed.length,
      results,
    });
  } catch (error) {
    console.error("[cron/acc-sync] falha geral", error);
    return NextResponse.json(
      { ok: false, error: "Falha na sincronização com o ACC" },
      { status: 500 },
    );
  }
}
