"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ensureRespondentCookie } from "@/lib/auth";
import { recalculateProjectDRI } from "@/lib/server/dri-service";

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
  if (!milestoneId) return { error: "Marco não identificado." };

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
    select: { projectId: true },
  });
  if (!milestone) return { error: "Marco não encontrado." };

  const respondentHash = await ensureRespondentCookie();

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

  await recalculateProjectDRI(milestone.projectId);
  revalidatePath(`/projects/${milestone.projectId}`);
  revalidatePath(`/projects/${milestone.projectId}/milestones/${milestoneId}`);

  return { ok: true };
}
