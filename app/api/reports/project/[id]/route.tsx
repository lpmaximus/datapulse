import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildProjectReport } from "@/lib/reports";
import { loadReportProjects } from "@/lib/server/report-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { ProjectReportPdf } from "@/components/pdf/project-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** PDF de status de um projeto. Fora da visibilidade do usuário = 404. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const { id } = await params;
  const [project] = await loadReportProjects(user, id);
  if (!project) return new NextResponse("Não encontrado", { status: 404 });

  const report = buildProjectReport(project, new Date());
  return pdfResponse(
    <ProjectReportPdf report={report} />,
    `status-${project.name}`,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
