"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireWriter, canManageProjects } from "@/lib/authz";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import { recomputeRollup } from "@/lib/server/rollup";
import { recomputePackage } from "@/lib/server/package-service";
import {
  normalizeTaskUpdate,
  isPackageType,
  PACKAGE_TYPE,
  validateParentLink,
  buildDeadlineChange,
  type Priority,
  type TaskKind,
  type TaskStatus,
} from "@/lib/tasks";
import { projectVisibility } from "@/lib/visibility";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function optDate(fd: FormData, key: string): Date | null {
  const v = str(fd, key);
  if (!v) return null;
  const d = new Date(v + "T00:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

const KINDS: TaskKind[] = ["TASK", "MILESTONE"];
const STATUSES: TaskStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function kindIsNotTask(fd: FormData): boolean {
  const k = str(fd, "kind");
  return k !== "" && k !== "TASK";
}

export interface TaskFormState {
  ok?: boolean;
  error?: string;
  /** Muda a cada sucesso — gatilho para limpar o formulário. */
  at?: number;
}

function revalidateTask(projectId: string, taskId?: string) {
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/projects/${projectId}/tasks/${taskId}`);
  revalidatePath("/");
  revalidatePath("/my-work");
}

function checkDates(startDate: Date | null, plannedDate: Date | null): string | null {
  if (startDate && plannedDate && startDate.getTime() > plannedDate.getTime()) {
    return "O início não pode ser depois do término planejado.";
  }
  return null;
}

/** Carrega um marco candidato a pai e valida o vínculo antes de gravar. */
async function resolveParent(
  parentId: string | null,
  child: { id?: string; projectId: string; kind: TaskKind },
): Promise<{ error: string } | { parentId: string | null }> {
  if (!parentId) return { parentId: null };
  const parent = await prisma.milestone.findUnique({
    where: { id: parentId },
    select: { id: true, projectId: true, kind: true, parentId: true },
  });
  if (!parent) return { error: "Marco selecionado não encontrado." };
  // `validateParentLink` recusa `parent.projectId !== child.projectId` — e
  // `child.projectId` já foi confirmado como da organização de quem chama
  // antes desta função ser acionada. É isso que impede escolher como pai um
  // marco de outro projeto (de outra organização, inclusive) só pelo id.
  const error = validateParentLink(child, parent);
  if (error) return { error };
  return { parentId: parent.id };
}

export async function createTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const me = await requireRole(["ADMIN", "MANAGER"]);

  const projectId = str(formData, "projectId");
  const name = str(formData, "name");
  if (!projectId) return { error: "Projeto não identificado." };
  if (!name) return { error: "Informe o nome da tarefa." };
  if (!(await projectIsWritable(projectId, me.organizationId))) return { error: READONLY_MESSAGE };

  const kind = pick(str(formData, "kind"), KINDS, "TASK");
  const startDate = kind === "MILESTONE" ? null : optDate(formData, "startDate");
  const plannedDate = optDate(formData, "plannedDate");
  const dateError = checkDates(startDate, plannedDate);
  if (dateError) return { error: dateError };

  const rawParentId = str(formData, "parentId") || null;
  // Pacote de revisão é sempre uma Tarefa dentro de um Marco.
  if (isPackageType(str(formData, "type")) && (kind !== "TASK" || !rawParentId)) {
    return { error: "Pacote de revisão precisa estar dentro de um marco." };
  }
  const parentResult = kind === "TASK" ? await resolveParent(rawParentId, { projectId, kind }) : { parentId: null };
  if ("error" in parentResult) return { error: parentResult.error };

  const assigneeId = str(formData, "assigneeId") || null;
  if (assigneeId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assigneeId, organizationId: me.organizationId },
      select: { id: true },
    });
    if (!assignee) return { error: "Responsável inválido." };
  }

  const impactRaw = str(formData, "economicImpact");
  const impact = impactRaw ? Number(impactRaw.replace(/[^\d.-]/g, "")) : null;

  await prisma.milestone.create({
    data: {
      projectId,
      name,
      kind,
      parentId: parentResult.parentId,
      type: str(formData, "type") || null,
      criticality: pick(str(formData, "criticality"), PRIORITIES, "MEDIUM"),
      economicImpact: impact != null && Number.isFinite(impact) ? impact : null,
      assigneeId,
      startDate,
      plannedDate,
    },
  });

  if (parentResult.parentId) await recomputeRollup(parentResult.parentId);
  await recalculateProjectDRI(projectId);
  revalidateTask(projectId);
  return { ok: true, at: Date.now() };
}

/**
 * Atualiza a tarefa.
 *
 * Gerente edita tudo. O responsável pela tarefa só atualiza status, avanço e
 * previsão — é quem está executando, mas não redefine escopo nem linha de base.
 */
export async function updateTask(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireWriter();
  const taskId = str(formData, "taskId");
  if (!taskId) return { error: "Tarefa não identificada." };

  // Tarefa/Marco não tem organizationId próprio — herda via projeto. Sem
  // filtrar aqui, um taskId de outra organização passaria como "encontrada".
  const task = await prisma.milestone.findFirst({
    where: { id: taskId, project: projectVisibility(user) },
    select: {
      id: true,
      projectId: true,
      kind: true,
      type: true,
      parentId: true,
      assigneeId: true,
      startDate: true,
      plannedDate: true,
      forecastDate: true,
      actualDate: true,
      project: { select: { status: true } },
    },
  });
  if (!task) return { error: "Tarefa não encontrada." };
  if (task.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };

  const isManager = canManageProjects(user);
  if (!isManager && task.assigneeId !== user.id) {
    return { error: "Só o gerente ou o responsável pela tarefa podem atualizá-la." };
  }

  const childCount = await prisma.milestone.count({ where: { parentId: taskId } });
  // Pacote de revisão se comporta como grupo: status/avanço/prazo vêm das
  // revisões dentro dele, não do formulário.
  const isPackage = isPackageType(task.type);
  const isGroup = childCount > 0 || isPackage;

  if (isManager && !isPackage && isPackageType(str(formData, "type"))) {
    return { error: "O tipo \"Pacote de revisão\" é reservado; crie o pacote pela tela de documentos." };
  }
  if (isPackage && isManager && kindIsNotTask(formData)) {
    return { error: "Um pacote de revisão é sempre uma tarefa." };
  }

  // Marco com filhas não muda de tipo, e status/avanço/prazo vêm do rollup — não do formulário.
  const kind: TaskKind = isGroup
    ? (task.kind as TaskKind)
    : isManager
      ? pick(str(formData, "kind"), KINDS, task.kind as TaskKind)
      : (task.kind as TaskKind);
  const startDate = isManager ? optDate(formData, "startDate") : task.startDate;
  const plannedDate = isManager ? optDate(formData, "plannedDate") : task.plannedDate;

  let parentId = task.parentId;
  if (isManager && kind === "TASK") {
    const rawParentId = str(formData, "parentId") || null;
    if (isPackage && !rawParentId) return { error: "Pacote de revisão precisa estar dentro de um marco." };
    if (rawParentId !== task.parentId) {
      const parentResult = await resolveParent(rawParentId, { id: task.id, projectId: task.projectId, kind });
      if ("error" in parentResult) return { error: parentResult.error };
      parentId = parentResult.parentId;
    }
  }

  const dateError = isGroup ? null : checkDates(startDate, isManager ? plannedDate : task.plannedDate);
  if (dateError) return { error: dateError };

  let assigneeId = task.assigneeId;
  if (isManager) {
    const rawAssigneeId = str(formData, "assigneeId") || null;
    if (rawAssigneeId !== task.assigneeId) {
      if (rawAssigneeId) {
        const assignee = await prisma.user.findFirst({
          where: { id: rawAssigneeId, organizationId: user.organizationId },
          select: { id: true },
        });
        if (!assignee) return { error: "Responsável inválido." };
      }
      assigneeId = rawAssigneeId;
    }
  }

  let newForecastDate: Date | null = task.forecastDate;
  const baseData: Record<string, unknown> = {
    parentId,
    ...(isManager
      ? {
          name: str(formData, "name") || undefined,
          kind,
          type: isPackage ? PACKAGE_TYPE : str(formData, "type") || null,
          criticality: pick(str(formData, "criticality"), PRIORITIES, "MEDIUM"),
          assigneeId,
        }
      : {}),
  };

  if (isGroup) {
    // Filhas continuam a ser a fonte da verdade — só campos de escopo são gráveis aqui.
    if (isManager) baseData.plannedDate = plannedDate;
    await prisma.milestone.update({ where: { id: taskId }, data: baseData });
  } else {
    const normalized = normalizeTaskUpdate(
      {
        kind,
        status: pick(str(formData, "status"), STATUSES, "NOT_STARTED"),
        progress: Number(str(formData, "progress") || 0),
        startDate,
        actualDate: optDate(formData, "actualDate") ?? task.actualDate,
      },
      new Date(),
    );
    newForecastDate = optDate(formData, "forecastDate");
    await prisma.milestone.update({
      where: { id: taskId },
      data: {
        ...normalized,
        forecastDate: newForecastDate,
        ...baseData,
        ...(isManager ? { plannedDate } : {}),
      },
    });

    const change = buildDeadlineChange(task.forecastDate, newForecastDate);
    if (change) {
      await prisma.deadlineChange.create({
        data: { milestoneId: taskId, fromDate: change.fromDate, toDate: change.toDate },
      });
    }
  }

  // Recalcula o(s) marco(s) afetado(s): o próprio (se agrupa) e o antigo/novo pai, se mudou.
  if (isPackage) await recomputePackage(taskId);
  else if (isGroup) await recomputeRollup(taskId);
  if (parentId !== task.parentId) {
    if (task.parentId) await recomputeRollup(task.parentId);
    if (parentId) await recomputeRollup(parentId);
  } else if (parentId && !isGroup) {
    await recomputeRollup(parentId);
  }

  await recalculateProjectDRI(task.projectId);
  revalidateTask(task.projectId, taskId);
  return { ok: true, at: Date.now() };
}

/* ----------------------------- impedimentos ----------------------------- */

async function loadForImpediment(taskId: string, user: { id: string; role: string; organizationId: string }) {
  return prisma.milestone.findFirst({
    where: { id: taskId, project: projectVisibility(user) },
    select: {
      id: true,
      projectId: true,
      status: true,
      type: true,
      assigneeId: true,
      parentId: true,
      project: { select: { status: true } },
    },
  });
}

/**
 * Registra um impedimento. Tarefa em aberto passa a "Impedida" — o bloqueio
 * precisa aparecer no quadro, não só numa lista à parte.
 */
export async function addImpediment(
  _prev: TaskFormState,
  formData: FormData,
): Promise<TaskFormState> {
  const user = await requireWriter();
  const taskId = str(formData, "taskId");
  const description = str(formData, "description");
  if (!taskId) return { error: "Tarefa não identificada." };
  if (!description) return { error: "Descreva o que está travando." };

  const task = await loadForImpediment(taskId, user);
  if (!task) return { error: "Tarefa não encontrada." };
  if (task.project.status !== "ACTIVE") return { error: READONLY_MESSAGE };
  if (!canManageProjects(user) && task.assigneeId !== user.id) {
    return { error: "Só o gerente ou o responsável pela tarefa registram impedimentos." };
  }

  const ownerId = str(formData, "ownerId") || null;
  if (ownerId) {
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!owner) return { error: "Responsável por destravar inválido." };
  }

  await prisma.$transaction([
    prisma.impediment.create({
      data: {
        milestoneId: taskId,
        description,
        waitingOn: str(formData, "waitingOn") || null,
        ownerId,
        createdById: user.id,
      },
    }),
    ...(task.status !== "DONE" && task.status !== "CANCELLED"
      ? [prisma.milestone.update({ where: { id: taskId }, data: { status: "BLOCKED" } })]
      : []),
  ]);

  if (isPackageType(task.type)) await recomputePackage(task.id);
  else if (task.parentId) await recomputeRollup(task.parentId);
  revalidateTask(task.projectId, taskId);
  return { ok: true, at: Date.now() };
}

/** Resolve o impedimento. Sem outro bloqueio aberto, a tarefa volta a "Em andamento". */
export async function resolveImpediment(formData: FormData): Promise<void> {
  const user = await requireWriter();
  const impedimentId = str(formData, "impedimentId");
  if (!impedimentId) return;

  const imp = await prisma.impediment.findUnique({
    where: { id: impedimentId },
    select: { id: true, resolvedAt: true, milestoneId: true },
  });
  if (!imp || imp.resolvedAt) return;

  const task = await loadForImpediment(imp.milestoneId, user);
  if (!task || task.project.status !== "ACTIVE") return;
  if (!canManageProjects(user) && task.assigneeId !== user.id) return;

  await prisma.impediment.update({
    where: { id: impedimentId },
    data: { resolvedAt: new Date() },
  });

  const stillOpen = await prisma.impediment.count({
    where: { milestoneId: task.id, resolvedAt: null },
  });
  if (isPackageType(task.type)) {
    // O status do pacote é projeção das revisões; sem bloqueio, volta ao que elas dizem.
    await recomputePackage(task.id);
  } else {
    if (stillOpen === 0 && task.status === "BLOCKED") {
      await prisma.milestone.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
    }
    if (task.parentId) await recomputeRollup(task.parentId);
  }
  revalidateTask(task.projectId, task.id);
}

export interface DeleteResult {
  ok?: boolean;
  error?: string;
}

/**
 * Exclui uma tarefa/marco. Impedimentos, sinais, histórico de prazo e pontuação
 * do DRI dela vão junto (é o que o banco faz em cascata); solicitações ligadas
 * a ela continuam, só desvinculadas, e as tarefas filhas de um marco ficam sem
 * marco. Se era filha, o marco de origem é recalculado.
 */
export async function deleteTask(formData: FormData): Promise<DeleteResult> {
  const me = await requireRole(["ADMIN", "MANAGER"]);
  const taskId = str(formData, "taskId");
  if (!taskId) return { error: "Tarefa não identificada." };

  const task = await prisma.milestone.findFirst({
    where: { id: taskId, project: { organizationId: me.organizationId } },
    select: { id: true, projectId: true, parentId: true, kind: true, type: true },
  });
  if (!task) return { error: "Tarefa não encontrada." };
  if (!(await projectIsWritable(task.projectId, me.organizationId))) return { error: READONLY_MESSAGE };

  // Pacote com revisões ou marco com pacotes não se exclui: as revisões
  // ficariam sem pacote e os pacotes sem marco.
  if (isPackageType(task.type)) {
    const revisions = await prisma.documentRevision.count({ where: { milestoneId: task.id } });
    if (revisions > 0) {
      return { error: "Este pacote tem revisões de documento e não pode ser excluído. Para encerrá-lo, cancele as revisões." };
    }
  }
  if (task.kind === "MILESTONE") {
    const packages = await prisma.milestone.count({
      where: { parentId: task.id, type: PACKAGE_TYPE },
    });
    if (packages > 0) {
      return { error: "Este marco tem pacotes de revisão. Mova os pacotes para outro marco antes de excluí-lo." };
    }
  }

  await prisma.milestone.delete({ where: { id: task.id } });
  if (task.parentId) await recomputeRollup(task.parentId);
  await recalculateProjectDRI(task.projectId);

  revalidateTask(task.projectId);
  return { ok: true };
}
