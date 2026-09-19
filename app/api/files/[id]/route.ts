import { NextResponse, type NextRequest } from "next/server";
import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { projectVisibility } from "@/lib/visibility";
import { INLINE_CONTENT_TYPES, baseContentType } from "@/lib/files";

/**
 * Entrega um arquivo do projeto. O blob é privado: só esta rota o lê, depois
 * de conferir sessão, organização e visibilidade do projeto — tudo numa
 * consulta só, então arquivo de outro projeto/organização é "não encontrado".
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
  const file = await prisma.projectFile.findFirst({
    where: {
      id,
      organizationId: user.organizationId,
      project: projectVisibility(user),
    },
    select: { pathname: true, fileName: true, contentType: true },
  });
  if (!file) return new NextResponse("Não encontrado", { status: 404 });

  const result = await get(file.pathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });
  if (!result) return new NextResponse("Não encontrado", { status: 404 });

  const headers: Record<string, string> = {
    ETag: result.blob.etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers });
  }

  const forceDownload = request.nextUrl.searchParams.get("download") === "1";
  const inline = !forceDownload && INLINE_CONTENT_TYPES.includes(baseContentType(file.contentType));
  headers["Content-Type"] = file.contentType;
  headers["Content-Disposition"] =
    `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  return new NextResponse(result.stream, { headers });
}
