"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureRespondentCookie, hashRespondent } from "@/lib/auth";
import { recalculateProjectDRI } from "@/lib/server/dri-service";
import { markRequestAnswered } from "@/app/actions/demands";
import { getCurrentUser } from "@/lib/session";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";

export interface SignalFormState {
  ok?: boolean;
  error?: string;
}

/**
 * Camada 2 — grava a avaliação humana estruturada.
 * A identidade é pseudonimizada em lib/auth.ts antes de tocar o banco.
 */
export async function submitHumanSignal(
  _prev: SignalFormState,
  formData: FormData,
): Promise<SignalFormState> {
  const milestoneId = String(formData.get("milestoneId") ?? "");
  if (!milestoneId) return { error: "Tarefa não identificada." };

  const failureProbability = Number(formData.get("failureProbability"));
  const planConfidence = Number(formData.get("planConfidence"));

  if (!Number.isFinite(failureProbability) || failureProbability < 0 || failureProbability > 100) {
    return { error: "Probabilidade de falha deve estar entre 0 e 100." };
  }
  if (!Number.isFinite(planConfidence) || planConfidence < 1 || planConfidence > 5) {
    return { error: "Confiança no plano deve estar entre 1 e 5." };
  }

  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { projectId: true, project: { select: { status: true, organizationId: true } } },
  });
  if (!milestone) return { error: "Tarefa não encontrada." };
  if (!isProjectWritable(milestone.project.status)) return { error: READONLY_MESSAGE };

  // Com login, o pseudônimo deriva do usuário — assim a mesma pessoa é
  // reconhecida entre dispositivos, sem gravar quem ela é no sinal.
  const user = await getCurrentUser();
  // Sem organizationId próprio (herda via projeto): com usuário logado, a
  // tarefa precisa ser da organização dele — senão daria para gravar sinal
  // numa tarefa de outra organização só sabendo/adivinhando o milestoneId.
  if (user && milestone.project.organizationId !== user.organizationId) {
    return { error: "Tarefa não encontrada." };
  }
  const respondentHash = user
    ? hashRespondent(user.id)
    : await ensureRespondentCookie();

  await prisma.humanSignal.create({
    data: {
      milestoneId,
      respondentHash,
      respondentRole: String(formData.get("respondentRole") ?? "").trim() || null,
      failureProbability: Math.round(failureProbability),
      planConfidence: Math.round(planConfidence),
      perceivedBottleneck:
        String(formData.get("perceivedBottleneck") ?? "").trim() || null,
      blockedDecision: formData.get("blockedDecision") === "on",
    },
  });

  // Fecha a demanda, se houver uma pendente para este usuário nesta tarefa.
  if (user) await markRequestAnswered(milestoneId);

  await recalculateProjectDRI(milestone.projectId);
  revalidatePath(`/projects/${milestone.projectId}`);
  revalidatePath(`/projects/${milestone.projectId}/tasks/${milestoneId}`);
  revalidatePath("/my-work");

  return { ok: true };
}
