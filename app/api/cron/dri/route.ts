import { NextResponse } from "next/server";
import { recalculateAllProjects } from "@/lib/server/dri-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Recálculo diário do DRI — agendado em vercel.json (06:00 UTC).
 * Substitui a necessidade de fila/Kafka no MVP.
 *
 * A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const results = await recalculateAllProjects();
    return NextResponse.json({
      ok: true,
      calculatedAt: new Date().toISOString(),
      projects: results,
    });
  } catch (error) {
    console.error("[cron/dri] falha no recálculo", error);
    return NextResponse.json(
      { ok: false, error: "Falha no recálculo do DRI" },
      { status: 500 },
    );
  }
}
