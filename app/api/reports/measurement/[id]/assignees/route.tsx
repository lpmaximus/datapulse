import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { loadMeasurement } from "@/lib/server/measurement-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { MeasurementAssigneeReportPdf, MeasurementAssigneeSheetsPdf } from "@/components/pdf/measurement-assignee-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Folhas do BM por projetista (repasse interno). Só ADMIN e MANAGER.
 * Com `?person=Nome`, gera a relação de formatos daquele projetista, sem
 * valores, para enviar a ele.
 */
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

  const download = request.nextUrl.searchParams.get("download") === "1";
  const person = request.nextUrl.searchParams.get("person")?.trim();
  if (person) {
    const key = person.replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
    const has = m.items.some(
      (it) =>
        it.kind === "FORMAT" &&
        (it.assigneeName ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR") === key,
    );
    if (!has) return new NextResponse("Nenhum formato indicado para esse projetista", { status: 404 });
    const slug = person
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return pdfResponse(
      <MeasurementAssigneeSheetsPdf m={m} person={person} generatedAt={new Date()} />,
      `${m.code}-formatos-${slug || "projetista"}`,
      download,
    );
  }

  return pdfResponse(
    <MeasurementAssigneeReportPdf m={m} generatedAt={new Date()} />,
    `${m.code}-projetistas`,
    download,
  );
}
