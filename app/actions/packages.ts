"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { createPackage } from "@/lib/server/package-service";

export interface PackageFormState {
  error?: string;
  /** Nome do último pacote criado, para confirmar sem sair da tela. */
  created?: string;
  /** Muda a cada sucesso — gatilho para limpar o formulário. */
  at?: number;
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Cria um pacote de revisão (Tarefa) dentro de um Marco. O Marco é obrigatório.
 * Modelo do ACC: os documentos chegam em uma revisão, e essa revisão é a tarefa.
 */
export async function createPackageAction(
  _prev: PackageFormState,
  formData: FormData,
): Promise<PackageFormState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const projectId = str(formData, "projectId");
  const marcoId = str(formData, "marcoId");
  const name = str(formData, "name");
  if (!projectId) return { error: "Projeto não identificado." };
  if (!marcoId) return { error: "Escolha o marco do pacote." };
  if (!name) return { error: "Informe o nome do pacote." };

  if (!(await projectIsWritable(projectId, me.organizationId))) return { error: READONLY_MESSAGE };

  const assigneeId = str(formData, "assigneeId") || null;
  if (assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, organizationId: me.organizationId },
      select: { id: true },
    });
    if (!assignee) return { error: "Responsável inválido." };
  }

  // O marco precisa ser do projeto (já confirmado como da organização acima):
  // `createPackage` recusa marco de outro projeto via validateParentLink.
  const result = await createPackage({
    projectId,
    marcoId,
    name,
    startDate: optDate(formData, "startDate"),
    plannedDate: optDate(formData, "plannedDate"),
    assigneeId,
  });
  if ("error" in result) return { error: result.error };

  await recalculateProjectDRI(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath("/documents");
  revalidatePath("/");
  return { created: name, at: Date.now() };
}
