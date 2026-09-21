"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWriter } from "@/lib/authz";
import { isProjectWritable, READONLY_MESSAGE } from "@/lib/tasks";
import { canSeeProject } from "@/lib/server/project-access";
import {
  canReceiveAnalysis,
  checkRequestDelegation,
  checkRespondDelegation,
  checkWithdrawDelegation,
  currentAnalystId,
} from "@/lib/delegation";
import type { TransitionState } from "@/app/actions/documents";

/**
 * Delegação da análise de uma revisão (ver lib/delegation.ts para as regras).
 *
 * Só a análise muda de mãos, e só quando o destinatário aceita. Status, ciclo
 * e vencimento da revisão não são tocados. Cada passo grava um evento no
 * histórico (DocumentTransition, ações DELEGATION_*), que é a trilha de quem
 * passou o quê a quem — o gerente do projeto não é avisado (decisão de
 * 21/09/2026), então o histórico é o único registro.
 */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

const REVISION_SELECT = {
  id: true,
  status: true,
  round: true,
  dueAt: true,
  specialistId: true,
  document: {
    select: {
      id: true,
      projectId: true,
      responsibleId: true,
      project: { select: { status: true, organizationId: true } },
    },
  },
} as const;

type User = Awaited<ReturnType<typeof requireWriter>>;

/** Revisão da organização, visível ao usuário e em projeto gravável. */
async function loadRevision(user: User, revisionId: string) {
  const revision = await prisma.documentRevision.findUnique({
    where: { id: revisionId },
    select: REVISION_SELECT,
  });
  if (
    !revision ||
    revision.document.project.organizationId !== user.organizationId ||
    !(await canSeeProject(user, revision.document.projectId))
  ) {
    return { error: "Revisão não encontrada." as const };
  }
  if (!isProjectWritable(revision.document.project.status)) {
    return { error: READONLY_MESSAGE };
  }
  return { revision };
}

function revalidate(documentId: string, projectId: string) {
  revalidatePath(`/documents/${documentId}`);
  revalidatePath(`/projects/${projectId}/documents`);
  revalidatePath("/documents");
  revalidatePath("/my-work");
}

/** Quem está com a análise propõe um colega. Fica pendente até ele responder. */
export async function requestDelegation(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const revisionId = str(formData, "revisionId");
  const toUserId = str(formData, "toUserId");
  if (!revisionId) return { error: "Revisão não identificada." };

  const loaded = await loadRevision(user, revisionId);
  if ("error" in loaded) return { error: loaded.error };
  const { revision } = loaded;

  const [to, pending] = await Promise.all([
    toUserId
      ? prisma.user.findFirst({
          where: { id: toUserId, organizationId: user.organizationId, isActive: true },
          select: { id: true, name: true, role: true },
        })
      : Promise.resolve(null),
    prisma.analysisDelegation.findFirst({
      where: { revisionId, status: "PENDING" },
      select: { id: true },
    }),
  ]);

  const error = checkRequestDelegation({
    userId: user.id,
    revisionStatus: revision.status,
    analystId: currentAnalystId({
      specialistId: revision.specialistId,
      responsibleId: revision.document.responsibleId,
    }),
    toUserId,
    toUserEligible: to != null && canReceiveAnalysis(to.role),
    hasPending: pending != null,
  });
  if (error || !to) return { error: error ?? "Esta pessoa não pode receber a análise." };

  const comment = str(formData, "comment") || null;

  await prisma.$transaction([
    prisma.analysisDelegation.create({
      data: { revisionId, fromUserId: user.id, toUserId: to.id, note: comment },
    }),
    prisma.documentTransition.create({
      data: {
        revisionId,
        action: "DELEGATION_REQUESTED",
        fromStatus: "IN_REVIEW",
        toStatus: "IN_REVIEW",
        round: revision.round,
        actorId: user.id,
        actorName: user.name,
        assignedToId: to.id,
        assignedToName: to.name,
        comment,
        dueAt: revision.dueAt,
      },
    }),
  ]);

  revalidate(revision.document.id, revision.document.projectId);
  return { ok: true };
}

/**
 * O destinatário aceita (a análise passa a ser dele) ou recusa (nada muda;
 * o motivo é obrigatório). Campo `decision`: "accept" ou "decline".
 */
export async function respondDelegation(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const delegationId = str(formData, "delegationId");
  const decisionRaw = str(formData, "decision");
  if (!delegationId || (decisionRaw !== "accept" && decisionRaw !== "decline")) {
    return { error: "Dados incompletos." };
  }
  const decision = decisionRaw;

  const delegation = await prisma.analysisDelegation.findUnique({
    where: { id: delegationId },
    select: {
      id: true,
      status: true,
      revisionId: true,
      fromUserId: true,
      toUserId: true,
      from: { select: { name: true } },
    },
  });
  if (!delegation) return { error: "Delegação não encontrada." };

  const loaded = await loadRevision(user, delegation.revisionId);
  if ("error" in loaded) return { error: loaded.error };
  const { revision } = loaded;

  const comment = str(formData, "comment");
  const error = checkRespondDelegation({
    userId: user.id,
    decision,
    comment,
    delegation,
    revisionStatus: revision.status,
    analystId: currentAnalystId({
      specialistId: revision.specialistId,
      responsibleId: revision.document.responsibleId,
    }),
  });
  if (error) return { error };

  const now = new Date();
  const accepted = decision === "accept";

  await prisma.$transaction([
    prisma.analysisDelegation.updateMany({
      // O filtro de status evita responder duas vezes ao mesmo pedido.
      where: { id: delegation.id, status: "PENDING" },
      data: {
        status: accepted ? "ACCEPTED" : "DECLINED",
        respondedAt: now,
        responseNote: comment || null,
      },
    }),
    ...(accepted
      ? [
          prisma.documentRevision.update({
            where: { id: revision.id },
            data: { specialistId: user.id },
          }),
        ]
      : []),
    prisma.documentTransition.create({
      data: {
        revisionId: revision.id,
        action: accepted ? "DELEGATION_ACCEPTED" : "DELEGATION_DECLINED",
        fromStatus: "IN_REVIEW",
        toStatus: "IN_REVIEW",
        round: revision.round,
        actorId: user.id,
        actorName: user.name,
        // Aceita: a análise vai para quem aceitou. Recusada: segue com quem pediu.
        assignedToId: accepted ? user.id : delegation.fromUserId,
        assignedToName: accepted ? user.name : delegation.from.name,
        comment: comment || null,
        dueAt: revision.dueAt,
      },
    }),
  ]);

  revalidate(revision.document.id, revision.document.projectId);
  return { ok: true };
}

/** Quem pediu retira o pedido enquanto ele está pendente. */
export async function withdrawDelegation(
  _prev: TransitionState,
  formData: FormData,
): Promise<TransitionState> {
  const user = await requireWriter();

  const delegationId = str(formData, "delegationId");
  if (!delegationId) return { error: "Delegação não identificada." };

  const delegation = await prisma.analysisDelegation.findUnique({
    where: { id: delegationId },
    select: {
      id: true,
      status: true,
      revisionId: true,
      fromUserId: true,
      to: { select: { name: true } },
    },
  });
  if (!delegation) return { error: "Delegação não encontrada." };

  const loaded = await loadRevision(user, delegation.revisionId);
  if ("error" in loaded) return { error: loaded.error };
  const { revision } = loaded;

  const error = checkWithdrawDelegation({ userId: user.id, delegation });
  if (error) return { error };

  await prisma.$transaction([
    prisma.analysisDelegation.updateMany({
      where: { id: delegation.id, status: "PENDING" },
      data: { status: "CANCELLED", respondedAt: new Date() },
    }),
    prisma.documentTransition.create({
      data: {
        revisionId: revision.id,
        action: "DELEGATION_CANCELLED",
        fromStatus: "IN_REVIEW",
        toStatus: "IN_REVIEW",
        round: revision.round,
        actorId: user.id,
        actorName: user.name,
        assignedToId: user.id,
        assignedToName: user.name,
        comment: `Pedido a ${delegation.to.name} retirado.`,
        dueAt: revision.dueAt,
      },
    }),
  ]);

  revalidate(revision.document.id, revision.document.projectId);
  return { ok: true };
}
