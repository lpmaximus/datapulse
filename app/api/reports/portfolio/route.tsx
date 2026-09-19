import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildPortfolioReport } from "@/lib/reports";
import { loadReportProjects } from "@/lib/server/report-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { PortfolioReportPdf } from "@/components/pdf/portfolio-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** PDF da carteira: todos os projetos que o usuário enxerga. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const projects = await loadReportProjects(user);
  const report = buildPortfolioReport(projects, new Date());
  return pdfResponse(
    <PortfolioReportPdf report={report} />,
    "carteira",
    request.nextUrl.searchParams.get("download") === "1",
  );
}
