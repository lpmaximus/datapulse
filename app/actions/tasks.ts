"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser, canManageProjects } from "@/lib/authz";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { projectIsWritable, READONLY_MESSAGE } from "@/lib/server/project-guard";
import {
  normalizeTaskUpdate,
  validateParentLink,
  rollupMilestone,
  buildDeadlineChange,
  type Priority,
  type TaskKind,
  type TaskStatus,
} from "@/lib/tasks";

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
const STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function pick<T extends string>(value: string, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
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

/**
 * Recalcula status/avanço/prazos do Marco a partir das Tarefas filhas —
 * chamado sempre que uma filha é criada/editada/movida, ou o próprio Marco
 * teve uma filha adicionada/removida. Grava histórico quando o prazo previsto
 * do Marco mudar por causa disso.
 */
async function recomputeRollup(milestoneId: string) {
  const children = await prisma.milestone.findMany({
    where: { parentId: milestoneId },
    select: {
      kind: true,
      status: true,
      progress: true,
      startDate: true,
      plannedDate: true,
      forecastDate: true,
      actualDate: true,
    },
  });
  if (children.length === 0) return;

  const current = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { forecastDate: true },
  });
  const result = rollupMilestone(children);
  const change = current ? buildDeadlineChange(current.forecastDate, result.forecastDate) : null;

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      status: result.status,
      progress: result.progress,
      forecastDate: result.forecastDate,
      actualDate: result.actualDate,
    },
  });

  if (change) {
    await prisma.deadlineChange.create({
      data: {
        milestoneId,
        fromDate: change.fromDate,
        toDate: change.toDate,
        reason: "Recalculado a partir das tarefas filhas.",
      },
    });
  }
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
  const user = await requireUser();
  const taskId = str(formData, "taskId");
  if (!taskId) return { error: "Tarefa não identificada." };

  // Tarefa/Marco não tem organizationId próprio — herda via projeto. Sem
  // filtrar aqui, um taskId de outra organização passaria como "encontrada".
  const task = await prisma.milestone.findFirst({
    where: { id: taskId, project: { organizationId: user.organizationId } },
    select: {
      id: true,
      projectId: true,
      kind: true,
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
  const isGroup = childCount > 0;

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
          type: str(formData, "type") || null,
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
  if (isGroup) await recomputeRollup(taskId);
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

async function loadForImpediment(taskId: string, organizationId: string) {
  return prisma.milestone.findFirst({
    where: { id: taskId, project: { organizationId } },
    select: {
      id: true,
      projectId: true,
      status: true,
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
  const user = await requireUser();
  const taskId = str(formData, "taskId");
  const description = str(formData, "description");
  if (!taskId) return { error: "Tarefa não identificada." };
  if (!description) return { error: "Descreva o que está travando." };

  const task = await loadForImpediment(taskId, user.organizationId);
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
    ...(task.status !== "DONE"
      ? [prisma.milestone.update({ where: { id: taskId }, data: { status: "BLOCKED" } })]
      : []),
  ]);

  if (task.parentId) await recomputeRollup(task.parentId);
  revalidateTask(task.projectId, taskId);
  return { ok: true, at: Date.now() };
}

/** Resolve o impedimento. Sem outro bloqueio aberto, a tarefa volta a "Em andamento". */
export async function resolveImpediment(formData: FormData): Promise<void> {
  const user = await requireUser();
  const impedimentId = str(formData, "impedimentId");
  if (!impedimentId) return;

  const imp = await prisma.impediment.findUnique({
    where: { id: impedimentId },
    select: { id: true, resolvedAt: true, milestoneId: true },
  });
  if (!imp || imp.resolvedAt) return;

  const task = await loadForImpediment(imp.milestoneId, user.organizationId);
  if (!task || task.project.status !== "ACTIVE") return;
  if (!canManageProjects(user) && task.assigneeId !== user.id) return;

  await prisma.impediment.update({
    where: { id: impedimentId },
    data: { resolvedAt: new Date() },
  });

  const stillOpen = await prisma.impediment.count({
    where: { milestoneId: task.id, resolvedAt: null },
  });
  if (stillOpen === 0 && task.status === "BLOCKED") {
    await prisma.milestone.update({ where: { id: task.id }, data: { status: "IN_PROGRESS" } });
  }

  if (task.parentId) await recomputeRollup(task.parentId);
  revalidateTask(task.projectId, task.id);
}
