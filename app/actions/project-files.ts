"use server";

import { revalidatePath } from "next/cache";
import { del, head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { Prisma } from "@prisma/client";
import { storeUsedBytes } from "@/lib/server/files";
import { projectVisibility } from "@/lib/visibility";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_BYTES,
  ORG_QUOTA_BYTES,
  baseContentType,
  isBlobPathnameFor,
  formatBytes,
} from "@/lib/files";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export interface FileFormState {
  ok?: boolean;
  error?: string;
}

/**
 * Registra no banco um arquivo que o navegador acabou de enviar ao Blob.
 *
 * Tamanho e tipo vêm do próprio blob (`head`), nunca do formulário. Se algo
 * falha depois do envio, o blob é apagado para não ficar ocupando cota sem
 * dono — mas só depois de provar que o caminho é deste projeto e que ainda
 * não está registrado (senão um erro repetido apagaria um arquivo bom).
 */
export async function registerProjectFile(formData: FormData): Promise<FileFormState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const orgId = me.organizationId;

  const projectId = str(formData, "projectId");
  const pathname = str(formData, "pathname");
  if (!projectId || !pathname) return { error: "Envio incompleto." };

  // Só o que é deste projeto (e, portanto, desta organização) é considerado.
  if (!isBlobPathnameFor(projectId, pathname)) return { error: "Destino do arquivo inválido." };
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: { id: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!(await projectIsWritable(projectId, orgId))) return { error: READONLY_MESSAGE };

  const already = await prisma.projectFile.findUnique({ where: { pathname }, select: { id: true } });
  if (already) return { error: "Este arquivo já foi registrado." };

  const discard = async (error: string): Promise<FileFormState> => {
    try {
      await del(pathname);
    } catch {
      /* melhor esforço */
    }
    return { error };
  };

  const kind = str(formData, "kind");
  if (!kind) return discard("Informe o tipo do documento.");

  let blob;
  try {
    blob = await head(pathname);
  } catch {
    return { error: "Arquivo não encontrado no armazenamento. Tente enviar de novo." };
  }
  if (blob.size > MAX_FILE_BYTES) return discard(`Arquivo acima de ${formatBytes(MAX_FILE_BYTES)}.`);
  const contentType = baseContentType(blob.contentType);
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) return discard("Tipo de arquivo não permitido.");
  // `head` já enxerga este blob: a cota compara o que já estava registrado + este arquivo.
  if ((await storeUsedBytes()) + blob.size > ORG_QUOTA_BYTES) {
    return discard("Limite de armazenamento da plataforma atingido.");
  }

  const fileName = str(formData, "fileName") || pathname.split("/").pop() || "arquivo";
  const issuedRaw = str(formData, "issuedAt");
  const issuedAt = issuedRaw ? new Date(issuedRaw + "T00:00:00.000Z") : null;

  try {
    await prisma.projectFile.create({
      data: {
        organizationId: orgId,
        projectId,
        title: str(formData, "title") || fileName,
        kind,
        reference: str(formData, "reference") || null,
        issuedAt: issuedAt && !Number.isNaN(issuedAt.getTime()) ? issuedAt : null,
        note: str(formData, "note") || null,
        pathname,
        fileName: fileName.slice(0, 200),
        contentType,
        sizeBytes: blob.size,
        uploadedById: me.id,
      },
    });
  } catch (err) {
    // Registro duplicado (duplo clique/retry): o outro pedido já criou a linha e é
    // dono do blob — descartar aqui apagaria o arquivo bom.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "Este arquivo já foi registrado." };
    }
    return discard("Não foi possível registrar o arquivo.");
  }

  revalidatePath(`/projects/${projectId}/files`);
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function deleteProjectFile(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const fileId = str(formData, "fileId");
  if (!fileId) return { error: "Arquivo não identificado." };

  const file = await prisma.projectFile.findFirst({
    where: { id: fileId, organizationId: me.organizationId, project: projectVisibility(me) },
    select: { id: true, pathname: true, projectId: true },
  });
  if (!file) return { error: "Arquivo não encontrado." };
  if (!(await projectIsWritable(file.projectId, me.organizationId))) return { error: READONLY_MESSAGE };

  // Blob primeiro: se falhar, o registro continua e a exclusão pode ser
  // repetida; o contrário deixaria arquivo órfão ocupando cota sem aparecer.
  try {
    await del(file.pathname);
  } catch {
    return { error: "Não foi possível excluir o arquivo do armazenamento. Tente de novo." };
  }
  await prisma.projectFile.deleteMany({ where: { id: file.id, organizationId: me.organizationId } });

  revalidatePath(`/projects/${file.projectId}/files`);
  revalidatePath(`/projects/${file.projectId}`);
  return { ok: true };
}
