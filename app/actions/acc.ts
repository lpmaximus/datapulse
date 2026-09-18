"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken, AccReauthRequiredError } from "@/lib/acc/connection";
import { listProjects } from "@/lib/acc/data-connector";
import { syncAccConnection } from "@/lib/acc/sync";
import { requireRole } from "@/lib/authz";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Vincula um projeto do DataPulse a um projeto do ACC. */
export async function linkProjectToAcc(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);
  const projectId = str(formData, "projectId");
  const connectionId = str(formData, "connectionId");
  const accProjectId = str(formData, "accProjectId");
  const accProjectName = str(formData, "accProjectName");

  if (!projectId || !connectionId || !accProjectId) return;

  const [project, connection] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId, organizationId: me.organizationId },
      select: { id: true },
    }),
    prisma.accConnection.findFirst({
      where: { id: connectionId, organizationId: me.organizationId },
      select: { id: true },
    }),
  ]);
  if (!project || !connection) return;

  await prisma.project.updateMany({
    where: { id: projectId, organizationId: me.organizationId },
    data: { accConnectionId: connectionId, accProjectId, accProjectName: accProjectName || null },
  });

  revalidatePath("/settings/acc");
  revalidatePath(`/projects/${projectId}`);
}

export async function unlinkProjectFromAcc(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);
  const projectId = str(formData, "projectId");
  if (!projectId) return;

  await prisma.project.updateMany({
    where: { id: projectId, organizationId: me.organizationId },
    data: { accConnectionId: null, accProjectId: null, accProjectName: null },
  });

  revalidatePath("/settings/acc");
  revalidatePath(`/projects/${projectId}`);
}

/** Dispara a sincronização manualmente, sem esperar o cron. */
export async function syncAccNow(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);
  const connectionId = str(formData, "connectionId");
  if (!connectionId) return;

  const connection = await prisma.accConnection.findFirst({
    where: { id: connectionId, organizationId: me.organizationId },
    select: {
      id: true,
      hubId: true,
      hubName: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
      dataRequestId: true,
      lastJobId: true,
    },
  });
  if (!connection) return;

  await syncAccConnection(connection);
  revalidatePath("/settings/acc");
}

/** Remove a conexão. Os sinais já importados permanecem — são histórico. */
export async function disconnectAcc(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN"]);
  const connectionId = str(formData, "connectionId");
  if (!connectionId) return;

  await prisma.accConnection.deleteMany({
    where: { id: connectionId, organizationId: me.organizationId },
  });
  revalidatePath("/settings/acc");
}

export interface AccProjectOption {
  id: string;
  name: string;
}

/** Lista projetos do hub para o seletor de vínculo. */
export async function fetchAccProjects(connectionId: string): Promise<{
  projects: AccProjectOption[];
  error: string | null;
}> {
  const me = await requireRole(["ADMIN"]);

  const connection = await prisma.accConnection.findFirst({
    where: { id: connectionId, organizationId: me.organizationId },
    select: {
      id: true,
      hubId: true,
      hubName: true,
      accessTokenEnc: true,
      refreshTokenEnc: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
      dataRequestId: true,
      lastJobId: true,
    },
  });
  if (!connection) return { projects: [], error: "Conexão não encontrada." };

  try {
    const token = await getValidAccessToken(connection);
    return { projects: await listProjects(token, connection.hubId), error: null };
  } catch (error) {
    if (error instanceof AccReauthRequiredError) {
      return { projects: [], error: error.message };
    }
    return {
      projects: [],
      error: error instanceof Error ? error.message : "Falha ao listar projetos do ACC.",
    };
  }
}
