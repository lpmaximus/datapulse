/**
 * Delegação da análise de uma revisão.
 *
 * Módulo puro (sem Prisma/Next): decide quem pode pedir, responder e retirar.
 * Delega-se só a ANÁLISE da revisão em curso (`DocumentRevision.specialistId`),
 * nunca o documento nem a emissão. O destinatário precisa aceitar; a
 * delegação não muda o status, o ciclo nem o vencimento da revisão.
 * Cada função devolve a mensagem de erro (em português, pronta para a tela)
 * ou `null` quando a ação é permitida.
 */

export type DelegationStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";

/** Papéis que podem receber uma análise (Executivo só lê). */
export const DELEGATE_ROLES = ["ADMIN", "MANAGER", "SPECIALIST"] as const;

export function canReceiveAnalysis(role: string): boolean {
  return (DELEGATE_ROLES as readonly string[]).includes(role);
}

/**
 * Quem está com a análise da vez: o especialista designado ou, sem designado,
 * o responsável pelo documento — a mesma regra do parecer (`recordAnalysis`).
 */
export function currentAnalystId(r: {
  specialistId: string | null;
  responsibleId: string | null;
}): string | null {
  return r.specialistId ?? r.responsibleId ?? null;
}

export function checkRequestDelegation(input: {
  userId: string;
  revisionStatus: string;
  analystId: string | null;
  toUserId: string;
  /** Destinatário ativo, da mesma organização e com papel que grava. */
  toUserEligible: boolean;
  hasPending: boolean;
}): string | null {
  if (input.revisionStatus !== "IN_REVIEW") {
    return "Só uma revisão em análise pode ter a análise delegada.";
  }
  if (input.analystId !== input.userId) {
    return "Só quem está com a análise pode delegá-la.";
  }
  if (!input.toUserId) return "Escolha o especialista que vai receber a análise.";
  if (input.toUserId === input.userId) {
    return "Escolha outra pessoa para receber a análise.";
  }
  if (!input.toUserEligible) return "Esta pessoa não pode receber a análise.";
  if (input.hasPending) return "Já existe uma delegação pendente para esta revisão.";
  return null;
}

export function checkRespondDelegation(input: {
  userId: string;
  decision: "accept" | "decline";
  comment: string;
  delegation: { status: string; toUserId: string; fromUserId: string };
  revisionStatus: string;
  analystId: string | null;
}): string | null {
  const d = input.delegation;
  if (d.status !== "PENDING") return "Esta delegação já foi respondida.";
  if (d.toUserId !== input.userId) return "Só o destinatário responde à delegação.";
  if (input.revisionStatus !== "IN_REVIEW") return "A revisão não está mais em análise.";
  if (d.fromUserId !== input.analystId) return "A análise mudou de mãos desde o pedido.";
  if (input.decision === "decline" && !input.comment.trim()) {
    return "Informe o motivo da recusa.";
  }
  return null;
}

export function checkWithdrawDelegation(input: {
  userId: string;
  delegation: { status: string; fromUserId: string };
}): string | null {
  if (input.delegation.status !== "PENDING") return "Esta delegação já foi respondida.";
  if (input.delegation.fromUserId !== input.userId) {
    return "Só quem pediu a delegação pode retirá-la.";
  }
  return null;
}
