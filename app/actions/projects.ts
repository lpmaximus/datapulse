"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { requireRole } from "@/lib/authz";
import { isProjectWritable } from "@/lib/tasks";
import { parseDecimalBR, round2 } from "@/lib/measurements";
import {
  canCloseProject,
  canReopenProject,
  checklistSnapshot,
  closureChecklist,
  closureMetrics,
  validateClosure,
  validateReopen,
} from "@/lib/project-closure";
import { loadClosureInput } from "@/lib/server/project-closure-service";
import { toNumber } from "@/lib/format";

/** Valor do A1 em pt-BR ("900,00"); vazio ou inválido = não definido. */
function parseA1Price(fd: FormData): number | null {
  const v = parseDecimalBR(fd.get("a1Price"));
  return v != null && v > 0 ? round2(v) : null;
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
      a1Price: parseA1Price(formData),
      serviceNumber: str(formData, "serviceNumber") || null,
      seOsg: str(formData, "seOsg") || null,
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
      a1Price: parseA1Price(formData),
      serviceNumber: str(formData, "serviceNumber") || null,
      seOsg: str(formData, "seOsg") || null,
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
  if (!project || project.status === "CLOSED" || project.status === next) return;

  await prisma.$transaction(async (tx) => {
    // Condição no status de origem: duas abas não gravam a mesma troca duas vezes.
    const res = await tx.project.updateMany({
      where: { id: projectId, organizationId: me.organizationId, status: project.status },
      data: { status: next },
    });
    if (res.count === 0) return;
    await tx.projectStatusChange.create({
      data: { projectId, fromStatus: project.status, toStatus: next, userId: me.id },
    });
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


/* ---------------------------------------------------------------------- */
/* Encerramento e reabertura (ver lib/project-closure.ts)                 */
/* ---------------------------------------------------------------------- */

export interface ClosureFormState {
  error?: string;
}

function revalidateProjectViews(projectId: string) {
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/close`);
  revalidatePath("/my-work");
  revalidatePath("/documents");
  revalidatePath("/");
}

/**
 * Encerra o projeto com o termo de encerramento. As pendências são
 * recalculadas aqui (não confia no que a tela mostrou): se houver alguma, a
 * justificativa é obrigatória, e a lista fica fotografada no termo.
 */
export async function closeProject(_prev: ClosureFormState, formData: FormData): Promise<ClosureFormState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const projectId = str(formData, "projectId");
  if (!projectId) return { error: "Projeto não informado." };

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: me.organizationId },
    select: { id: true, status: true, startsAt: true, endsAt: true, cost: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!canCloseProject(project.status)) return { error: "Este projeto já está encerrado." };

  const input = await loadClosureInput(me.organizationId, projectId);
  const checklist = closureChecklist(input);
  const parsed = validateClosure(
    {
      closureType: str(formData, "closureType"),
      closedOn: str(formData, "closedOn"),
      acceptanceRef: str(formData, "acceptanceRef"),
      summary: str(formData, "summary"),
      lessonsKeep: str(formData, "lessonsKeep"),
      lessonsImprove: str(formData, "lessonsImprove"),
      reason: str(formData, "reason"),
    },
    { pendingCount: checklist.pendingCount, startsAt: project.startsAt, today: new Date() },
  );
  if ("error" in parsed) return { error: parsed.error };
  const v = parsed.value;

  const metrics = closureMetrics(input, {
    startsAt: project.startsAt,
    endsAt: project.endsAt,
    closedOn: v.closedOn,
    cost: toNumber(project.cost),
  });

  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.project.updateMany({
      where: { id: projectId, organizationId: me.organizationId, status: project.status },
      data: { status: "CLOSED" },
    });
    if (res.count === 0) return false;
    await tx.projectStatusChange.create({
      data: {
        projectId,
        fromStatus: project.status,
        toStatus: "CLOSED",
        reason: v.reason,
        closureType: v.closureType,
        closedOn: v.closedOn,
        acceptanceRef: v.acceptanceRef,
        summary: v.summary,
        lessonsKeep: v.lessonsKeep,
        lessonsImprove: v.lessonsImprove,
        openItems: checklistSnapshot(checklist),
        metrics: { ...metrics },
        userId: me.id,
      },
    });
    return true;
  });
  if (!done) return { error: "O status do projeto mudou enquanto você preenchia. Recarregue a página." };

  revalidateProjectViews(projectId);
  redirect(`/projects/${projectId}/close`);
}

/** Reabre um projeto encerrado (volta a Ativo). Justificativa obrigatória. */
export async function reopenProject(_prev: ClosureFormState, formData: FormData): Promise<ClosureFormState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const projectId = str(formData, "projectId");
  if (!projectId) return { error: "Projeto não informado." };

  const parsed = validateReopen(str(formData, "reason"));
  if ("error" in parsed) return { error: parsed.error };

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: me.organizationId },
    select: { status: true },
  });
  if (!project) return { error: "Projeto não encontrado." };
  if (!canReopenProject(project.status)) return { error: "Só um projeto encerrado pode ser reaberto." };

  const done = await prisma.$transaction(async (tx) => {
    const res = await tx.project.updateMany({
      where: { id: projectId, organizationId: me.organizationId, status: "CLOSED" },
      data: { status: "ACTIVE" },
    });
    if (res.count === 0) return false;
    await tx.projectStatusChange.create({
      data: { projectId, fromStatus: "CLOSED", toStatus: "ACTIVE", reason: parsed.value, userId: me.id },
    });
    return true;
  });
  if (!done) return { error: "O status do projeto mudou. Recarregue a página." };

  revalidateProjectViews(projectId);
  redirect(`/projects/${projectId}`);
}
