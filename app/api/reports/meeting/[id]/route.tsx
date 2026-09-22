import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildMeetingReport } from "@/lib/reports";
import { loadReportMeeting } from "@/lib/server/report-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { MeetingReportPdf } from "@/components/pdf/meeting-report";
import { MeetingReportClientPdf } from "@/components/pdf/meeting-report-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PDF da ata de uma reunião. `?modelo=cliente` pede o modelo do formulário
 * controlado do cliente (ex.: MRS) — só existe quando o cliente do projeto
 * tem `meetingFormCode` cadastrado; sem isso, cai para o modelo DataPulse.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const { id } = await params;
  const input = await loadReportMeeting(user, id);
  if (!input) return new NextResponse("Não encontrado", { status: 404 });

  const report = buildMeetingReport(input, new Date());
  const wantsClientModel = request.nextUrl.searchParams.get("modelo") === "cliente";
  const useClientModel = wantsClientModel && !!report.header.meetingFormCode;

  return pdfResponse(
    useClientModel ? <MeetingReportClientPdf report={report} /> : <MeetingReportPdf report={report} />,
    `ata-reuniao-${input.title || input.projectName}`,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
