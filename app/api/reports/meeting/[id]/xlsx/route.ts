import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildMeetingReport } from "@/lib/reports";
import { loadReportMeeting } from "@/lib/server/report-service";
import { safeFileName } from "@/lib/server/pdf-response";
import { buildMeetingXlsx } from "@/lib/server/meeting-xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Ata da reunião em Excel (.xlsx) no padrão MRS — mesmas regras de acesso do PDF. */
export async function GET(
  _request: NextRequest,
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
  const buffer = await buildMeetingXlsx(report);
  const stamp = input.date.toISOString().slice(0, 10);
  const name = `${safeFileName(`ata-reuniao-${input.title || input.projectName}`)}-${stamp}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
