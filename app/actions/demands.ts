"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, requireUser } from "@/lib/authz";
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

/**
 * Convoca um especialista a avaliar uma tarefa. Não convoca em projeto
 * pausado ou encerrado.
 *
 * A convocação é NOMINAL — o gestor precisa saber a quem cobrar. A resposta
 * produzida, porém, não é vinculada a este registro: ver `markRequestAnswered`.
 */
export async function assignSignalRequest(formData: FormData): Promise<void> {
  const manager = await requireRole(["ADMIN", "MANAGER"]);

  const milestoneId = str(formData, "milestoneId");
  const assigneeId = str(formData, "assigneeId");
  if (!milestoneId || !assigneeId) return;

  // Marco não tem organizationId próprio — herda via projeto. E quem está
  // sendo convocado precisa ser da mesma organização de quem convoca.
  const [milestone, assignee] = await Promise.all([
    prisma.milestone.findFirst({
      where: { id: milestoneId, project: { organizationId: manager.organizationId } },
      select: { projectId: true, project: { select: { status: true } } },
    }),
    prisma.user.findFirst({
      // Terceirizado não loga, logo não responde avaliação.
      where: { id: assigneeId, organizationId: manager.organizationId, role: { not: "EXTERNAL" } },
      select: { id: true },
    }),
  ]);
  if (!milestone || !assignee || !isProjectWritable(milestone.project.status)) return;

  await prisma.signalRequest.upsert({
    where: { milestoneId_assigneeId: { milestoneId, assigneeId } },
    create: {
      milestoneId,
      assigneeId,
      requestedById: manager.id,
      dueAt: optDate(formData, "dueAt"),
      note: str(formData, "note") || null,
      status: "PENDING",
    },
    // Reconvocar uma tarefa já respondida reabre a demanda: a percepção muda
    // com o tempo, e é justamente essa variação que o DRI lê.
    update: {
      status: "PENDING",
      dueAt: optDate(formData, "dueAt"),
      note: str(formData, "note") || null,
      answeredAt: null,
      requestedById: manager.id,
    },
  });

  revalidatePath(`/projects/${milestone.projectId}/tasks/${milestoneId}`);
  revalidatePath("/my-work");
}

export async function dismissSignalRequest(formData: FormData): Promise<void> {
  const manager = await requireRole(["ADMIN", "MANAGER"]);

  const requestId = str(formData, "requestId");
  if (!requestId) return;

  // SignalRequest não tem organizationId próprio — herda via marco/projeto.
  // Confirma isso ANTES de atualizar, já que `update` por `id` sozinho
  // aceitaria o id de uma demanda de outra organização sem reclamar.
  const existing = await prisma.signalRequest.findFirst({
    where: { id: requestId, milestone: { project: { organizationId: manager.organizationId } } },
    select: { id: true },
  });
  if (!existing) return;

  const req = await prisma.signalRequest.update({
    where: { id: requestId },
    data: { status: "DISMISSED" },
    select: { milestone: { select: { id: true, projectId: true } } },
  });

  revalidatePath(
    `/projects/${req.milestone.projectId}/tasks/${req.milestone.id}`,
  );
  revalidatePath("/my-work");
}

/**
 * Marca a demanda do usuário atual como respondida.
 *
 * Ponto central do desenho: registra QUE respondeu e QUANDO, sem referenciar
 * o HumanSignal produzido. O gestor acompanha adesão sem conseguir ler
 * "quem disse o quê" a partir deste registro.
 *
 * Limite honesto: se houver um único convocado na tarefa, a correlação é
 * óbvia por inferência. E quem tiver acesso ao banco e ao RESPONDENT_SALT
 * consegue recomputar o hash do respondente. Isto é pseudonimato, não
 * anonimato forte.
 */
export async function markRequestAnswered(milestoneId: string): Promise<void> {
  const user = await requireUser();

  await prisma.signalRequest.updateMany({
    where: { milestoneId, assigneeId: user.id, status: "PENDING" },
    data: { status: "ANSWERED", answeredAt: new Date() },
  });

  revalidatePath("/my-work");
}
