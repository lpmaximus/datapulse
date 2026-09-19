import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildPackageReport } from "@/lib/reports";
import { loadReportPackage } from "@/lib/server/report-service";
import { pdfResponse } from "@/lib/server/pdf-response";
import { PackageReportPdf } from "@/components/pdf/package-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** PDF da ficha de um pacote de revisão (id da Tarefa-pacote). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const { id } = await params;
  const pkg = await loadReportPackage(user, id);
  if (!pkg) return new NextResponse("Não encontrado", { status: 404 });

  const report = buildPackageReport(pkg, new Date());
  return pdfResponse(
    <PackageReportPdf report={report} />,
    `pacote-${pkg.name}`,
    request.nextUrl.searchParams.get("download") === "1",
  );
}
