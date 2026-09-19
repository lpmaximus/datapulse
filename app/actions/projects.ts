"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { requireRole } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createProject(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const orgId = me.organizationId;

  const name = str(formData, "name");
  if (!name) redirect("/projects/new?error=nome-obrigatorio");

  const managerId = str(formData, "managerId") || null;
  const clientId = str(formData, "clientId") || null;
  const sectorId = str(formData, "sectorId") || null;
  const designFirmId = str(formData, "designFirmId") || null;

  // Cliente, setor, empresa e gerente precisam pertencer à mesma
  // organização — evita um projeto referenciar cadastro de outro tenant via
  // id adivinhado/trocado no formulário.
  const [client, sector, designFirm, manager] = await Promise.all([
    clientId
      ? prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    sectorId
      ? prisma.sector.findFirst({ where: { id: sectorId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    designFirmId
      ? prisma.empresa.findFirst({ where: { id: designFirmId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    managerId
      ? prisma.user.findFirst({ where: { id: managerId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (clientId && !client) redirect("/projects/new?error=cliente-invalido");
  if (sectorId && !sector) redirect("/projects/new?error=setor-invalido");
  if (designFirmId && !designFirm) redirect("/projects/new?error=empresa-invalida");
  if (managerId && !manager) redirect("/projects/new?error=gerente-invalido");

  const costRaw = str(formData, "cost");
  const cost = costRaw ? Number(costRaw.replace(/[^\d.-]/g, "")) : null;

  const project = await prisma.project.create({
    data: {
      organizationId: orgId,
      name,
      osNumber: str(formData, "osNumber") || null,
      clientId,
      sectorId,
      designFirmId,
      cost: cost != null && Number.isFinite(cost) ? cost : null,
      startsAt: optDate(formData, "startsAt"),
      endsAt: optDate(formData, "endsAt"),
      managerId,
    },
  });

  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${project.id}`);
}

/** Edita os dados cadastrais do projeto (mesmos campos da criação). */
export async function updateProject(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const orgId = me.organizationId;

  const projectId = str(formData, "projectId");
  if (!projectId) return;
  const back = (code: string) => redirect(`/projects/${projectId}/edit?error=${code}`);

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    select: { id: true, status: true },
  });
  if (!project) return;
  // Pausado/encerrado é somente leitura — checado aqui porque a action
  // continua chamável mesmo com o botão escondido.
  if (!isProjectWritable(project.status)) redirect(`/projects/${projectId}`);

  const name = str(formData, "name");
  if (!name) back("nome-obrigatorio");

  const managerId = str(formData, "managerId") || null;
  const clientId = str(formData, "clientId") || null;
  const sectorId = str(formData, "sectorId") || null;
  const designFirmId = str(formData, "designFirmId") || null;

  const [client, sector, designFirm, manager] = await Promise.all([
    clientId
      ? prisma.client.findFirst({ where: { id: clientId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    sectorId
      ? prisma.sector.findFirst({ where: { id: sectorId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    designFirmId
      ? prisma.empresa.findFirst({ where: { id: designFirmId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
    managerId
      ? prisma.user.findFirst({ where: { id: managerId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (clientId && !client) back("cliente-invalido");
  if (sectorId && !sector) back("setor-invalido");
  if (designFirmId && !designFirm) back("empresa-invalida");
  if (managerId && !manager) back("gerente-invalido");

  const startsAt = optDate(formData, "startsAt");
  const endsAt = optDate(formData, "endsAt");
  if (startsAt && endsAt && endsAt < startsAt) back("datas-invalidas");

  const costRaw = str(formData, "cost");
  const cost = costRaw ? Number(costRaw.replace(/[^\d.-]/g, "")) : null;

  await prisma.project.updateMany({
    where: { id: projectId, organizationId: orgId },
    data: {
      name,
      osNumber: str(formData, "osNumber") || null,
      clientId,
      sectorId,
      designFirmId,
      cost: cost != null && Number.isFinite(cost) ? cost : null,
      startsAt,
      endsAt,
      managerId,
    },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  redirect(`/projects/${projectId}`);
}

/** Recálculo manual — útil na demo, sem esperar o cron. */
export async function recalculateNow(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const projectId = str(formData, "projectId");
  if (!projectId) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: me.organizationId },
    select: { id: true },
  });
  if (!project) return;

  await recalculateProjectDRI(projectId);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

/**
 * Alterna ACTIVE/PAUSED direto da tabela — mesma UX do toggle "Ativar/des"
 * do gerenciador de referência. CLOSED não é alcançável por aqui de propósito
 * (é um estado terminal, não um "desligar" reversível).
 */
export async function toggleProjectStatus(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const projectId = str(formData, "projectId");
  if (!projectId) return;

  const next = formData.get("active") === "on" ? "ACTIVE" : "PAUSED";

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: me.organizationId },
    select: { status: true },
  });
  if (!project || project.status === "CLOSED") return;

  await prisma.project.updateMany({
    where: { id: projectId, organizationId: me.organizationId },
    data: { status: next },
  });

  // Pausar/reativar muda o que é editável e o que aparece no Painel e nas
  // demandas — todas essas telas precisam ser refeitas.
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/my-work");
  revalidatePath("/documents");
  revalidatePath("/");
}


/** Troca o gerente responsável pelo projeto. */
export async function setProjectManager(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const orgId = me.organizationId;

  const projectId = str(formData, "projectId");
  if (!projectId) return;

  const managerId = str(formData, "managerId") || null;
  const [project, manager] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } }),
    managerId
      ? prisma.user.findFirst({ where: { id: managerId, organizationId: orgId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!project) return;
  if (managerId && !manager) return;

  await prisma.project.updateMany({
    where: { id: projectId, organizationId: orgId },
    data: { managerId },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
}

/** Aloca uma pessoa ao projeto. A alocação define o que ela vê em /my-work. */
export async function addProjectMember(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const orgId = me.organizationId;

  const projectId = str(formData, "projectId");
  const userId = str(formData, "userId");
  if (!projectId || !userId) return;

  const roleInProject = str(formData, "roleInProject") || null;

  // Projeto, usuário e função-no-projeto precisam ser da mesma organização
  // de quem está alocando — impede colocar um usuário de outro tenant no
  // projeto e impede gravar uma função digitada fora do cadastro.
  const [project, user, role] = await Promise.all([
    prisma.project.findFirst({ where: { id: projectId, organizationId: orgId }, select: { id: true } }),
    prisma.user.findFirst({ where: { id: userId, organizationId: orgId }, select: { id: true } }),
    roleInProject
      ? prisma.jobFunction.findFirst({
          where: { organizationId: orgId, name: roleInProject, isActive: true },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!project || !user) return;
  if (roleInProject && !role) return;

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: {
      projectId,
      userId,
      roleInProject,
    },
    update: { roleInProject },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function removeProjectMember(formData: FormData): Promise<void> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const projectId = str(formData, "projectId");
  const userId = str(formData, "userId");
  if (!projectId || !userId) return;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: me.organizationId },
    select: { id: true },
  });
  if (!project) return;

  await prisma.projectMember.deleteMany({ where: { projectId, userId } });
  revalidatePath(`/projects/${projectId}`);
}
