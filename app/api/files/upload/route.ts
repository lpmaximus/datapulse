import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser } from "@/lib/session";
import { canManageProjects } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { storeUsedBytes } from "@/lib/server/files";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  ORG_QUOTA_BYTES,
  isBlobPathnameFor,
  formatBytes,
} from "@/lib/files";

/**
 * Emite o token para o navegador enviar o arquivo direto ao Blob (sem passar
 * pelo limite de 4,5 MB do corpo de uma função). Toda a autorização acontece
 * aqui, antes do token: sessão, papel, projeto da organização e gravável,
 * prefixo do caminho, tipo, tamanho e cota. O registro no banco é feito
 * depois, pela action registerProjectFile — não dependemos do callback
 * onUploadCompleted (que não alcança localhost).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user || user.mustChangePassword) throw new Error("Sessão expirada.");
        if (!canManageProjects(user)) throw new Error("Sem permissão para enviar arquivos.");

        let projectId = "";
        try {
          projectId = String(JSON.parse(clientPayload ?? "{}").projectId ?? "");
        } catch {
          /* payload inválido cai na checagem abaixo */
        }
        if (!projectId || !isBlobPathnameFor(projectId, pathname)) {
          throw new Error("Destino do arquivo inválido.");
        }
        if (!(await projectIsWritable(projectId, user.organizationId))) {
          throw new Error(READONLY_MESSAGE);
        }

        const remaining = ORG_QUOTA_BYTES - (await storeUsedBytes());
        if (remaining <= 0) {
          throw new Error(
            `Limite de armazenamento da plataforma atingido. Exclua arquivos antigos ou fale com o suporte.`,
          );
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: Math.min(MAX_FILE_BYTES, remaining),
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, projectId }),
        };
      },
      // O registro é feito pela action após o envio; nada a fazer aqui.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
