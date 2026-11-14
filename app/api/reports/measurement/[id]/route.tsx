import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadMeasurement } from "@/lib/server/measurement-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { MeasurementReportPdf } from "@/components/pdf/measurement-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** PDF do Boletim de Medição. Dado financeiro: só ADMIN e MANAGER. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return new NextResponse("Não autenticado", { status: 401 });
  }
  if (user.role !== "ADMIN" && user.role !== "MANAGER") {
    return new NextResponse("Sem permissão", { status: 403 });
  }

  const { id } = await params;
  const m = await loadMeasurement(user.organizationId, id);
  if (!m) return new NextResponse("Não encontrado", { status: 404 });

  return pdfResponse(
    <MeasurementReportPdf m={m} generatedAt={new Date()} />,
    m.code,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
