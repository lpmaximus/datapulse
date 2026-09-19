"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { buildDeadlineChange } from "@/lib/tasks";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface RequestFormState {
  ok?: boolean;
  error?: string;
  at?: number;
}

function revalidateRequest(projectId: string, milestoneId?: string | null, requestId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (requestId) revalidatePath(`/projects/${projectId}/requests/${requestId}`);
  if (milestoneId) revalidatePath(`/projects/${projectId}/tasks/${milestoneId}`);
  revalidatePath("/");
}

/**
 * Cria uma solicitação: pedido de documento de referência, informação
 * complementar etc. Pode estar ligada a uma tarefa/marco e a documentos do
 * projeto, ou ser só do projeto (nenhum vínculo) — "tudo referente ao
 * projeto", não só os documentos.
 */
export async function createRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const user = await requireUser();
  const projectId = str(formData, "projectId");
  const description = str(formData, "description");
  if (!projectId) return { error: "Projeto não identificado." };
  if (!description) return { error: "Descreva a solicitação." };
  if (!(await projectIsWritable(projectId, user.organizationId))) return { error: READONLY_MESSAGE };

  const milestoneId = str(formData, "milestoneId") || null;
  if (milestoneId) {
    const task = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { projectId: true },
    });
    if (!task || task.projectId !== projectId) {
      return { error: "Tarefa selecionada não pertence a este projeto." };
    }
  }

  const documentIds = formData.getAll("documentIds").map(String).filter(Boolean);
  if (documentIds.length) {
    const count = await prisma.document.count({ where: { id: { in: documentIds }, projectId } });
    if (count !== documentIds.length) return { error: "Algum documento selecionado não pertence a este projeto." };
  }

  const ownerId = str(formData, "ownerId") || null;
  if (ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!owner) return { error: "Responsável inválido." };
  }

  await prisma.request.create({
    data: {
      projectId,
      milestoneId,
      type: str(formData, "type") || null,
      description,
      ownerId,
      waitingOn: str(formData, "waitingOn") || null,
      dueAt: optDate(formData, "dueAt"),
      createdById: user.id,
      documents: documentIds.length
        ? { create: documentIds.map((documentId) => ({ documentId })) }
        : undefined,
    },
  });

  revalidateRequest(projectId, milestoneId);
  return { ok: true, at: Date.now() };
}

async function loadRequest(requestId: string, organizationId: string) {
  return prisma.request.findFirst({
    where: { id: requestId, project: { organizationId } },
    select: {
      id: true,
      projectId: true,
      milestoneId: true,
      status: true,
      dueAt: true,
      ownerId: true,
      project: { select: { status: true } },
    },
  });
}

/**
 * Reprograma o prazo de uma solicitação em aberto — grava histórico
 * (DeadlineChange) em vez de só sobrescrever o campo, no mesmo espírito do
 * prazo reprogramado de tarefa.
 */
export async function rescheduleRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const user = await requireUser();
  const requestId = str(formData, "requestId");
  if (!requestId) return { error: "Solicitação não identificada." };

  const request = await loadRequest(requestId, user.organizationId);
  if (!request) return { error: "Solicitação não encontrada." };
  if (request.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && request.ownerId !== user.id) {
    return { error: "Só o gerente ou o responsável pela solicitação podem reprogramá-la." };
  }

  const nextDueAt = optDate(formData, "dueAt");
  if (!nextDueAt) return { error: "Informe o novo prazo." };

  const change = buildDeadlineChange(request.dueAt, nextDueAt);
  await prisma.request.update({ where: { id: requestId }, data: { dueAt: nextDueAt } });
  if (change) {
    await prisma.deadlineChange.create({
      data: { requestId, fromDate: change.fromDate, toDate: change.toDate, reason: str(formData, "reason") || null },
    });
  }

  revalidateRequest(request.projectId, request.milestoneId, requestId);
  return { ok: true, at: Date.now() };
}

/** Marca a solicitação como respondida/concluída. */
export async function resolveRequest(formData: FormData): Promise<void> {
  const user = await requireUser();
  const requestId = str(formData, "requestId");
  if (!requestId) return;

  const request = await loadRequest(requestId, user.organizationId);
  if (!request || request.project.status !== "ACTIVE" || request.status !== "PENDING") return;
  if (!canManageProjects(user) && request.ownerId !== user.id) return;

  await prisma.request.update({
    where: { id: requestId },
    data: { status: "ANSWERED", resolvedAt: new Date() },
  });
  revalidateRequest(request.projectId, request.milestoneId, requestId);
}

/** Cancela a solicitação (pedido não segue mais, sem virar "respondida"). */
export async function dismissRequest(formData: FormData): Promise<void> {
  const user = await requireUser();
  const requestId = str(formData, "requestId");
  if (!requestId) return;

  const request = await loadRequest(requestId, user.organizationId);
  if (!request || request.project.status !== "ACTIVE" || request.status !== "PENDING") return;
  if (!canManageProjects(user)) return;

  await prisma.request.update({
    where: { id: requestId },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
  revalidateRequest(request.projectId, request.milestoneId, requestId);
}

/**
 * Edita os dados da solicitação (descrição, tipo, terceiro, responsável,
 * tarefa e documentos vinculados). O prazo NÃO é editado aqui: mudar prazo é
 * reprogramar, e reprogramar grava o histórico.
 */
export async function updateRequest(
  _prev: RequestFormState,
  formData: FormData,
): Promise<RequestFormState> {
  const user = await requireUser();
  const requestId = str(formData, "requestId");
  if (!requestId) return { error: "Solicitação não identificada." };

  const request = await loadRequest(requestId, user.organizationId);
  if (!request) return { error: "Solicitação não encontrada." };
  if (request.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && request.ownerId !== user.id) {
    return { error: "Só o gerente ou o responsável pela solicitação podem editá-la." };
  }

  const description = str(formData, "description");
  if (!description) return { error: "Descreva a solicitação." };

  const milestoneId = str(formData, "milestoneId") || null;
  if (milestoneId) {
    const task = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId: request.projectId },
      select: { id: true },
    });
    if (!task) return { error: "Tarefa selecionada não pertence a este projeto." };
  }

  const documentIds = formData.getAll("documentIds").map(String).filter(Boolean);
  if (documentIds.length) {
    const count = await prisma.document.count({
      where: { id: { in: documentIds }, projectId: request.projectId },
    });
    if (count !== documentIds.length) return { error: "Algum documento selecionado não pertence a este projeto." };
  }

  const ownerId = str(formData, "ownerId") || null;
  if (ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!owner) return { error: "Responsável inválido." };
  }

  await prisma.$transaction([
    prisma.request.update({
      where: { id: requestId },
      data: {
        description,
        type: str(formData, "type") || null,
        waitingOn: str(formData, "waitingOn") || null,
        ownerId,
        milestoneId,
      },
    }),
    prisma.requestDocument.deleteMany({ where: { requestId } }),
    ...(documentIds.length
      ? [
          prisma.requestDocument.createMany({
            data: documentIds.map((documentId) => ({ requestId, documentId })),
          }),
        ]
      : []),
  ]);

  // A tarefa antiga e a nova mostram a solicitação nas suas telas.
  revalidateRequest(request.projectId, request.milestoneId, requestId);
  if (milestoneId && milestoneId !== request.milestoneId) {
    revalidatePath(`/projects/${request.projectId}/tasks/${milestoneId}`);
  }
  return { ok: true, at: Date.now() };
}

/** Reabre uma solicitação respondida ou cancelada (só o gerente). */
export async function reopenRequest(formData: FormData): Promise<void> {
  const user = await requireUser();
  const requestId = str(formData, "requestId");
  if (!requestId) return;

  const request = await loadRequest(requestId, user.organizationId);
  if (!request || request.project.status !== "ACTIVE" || request.status === "PENDING") return;
  if (!canManageProjects(user)) return;

  await prisma.request.update({
    where: { id: requestId },
    data: { status: "PENDING", resolvedAt: null },
  });
  revalidateRequest(request.projectId, request.milestoneId, requestId);
}
