/**
 * Regras de Solicitação — puro, sem Prisma nem Next (testado em
 * test/requests.test.mjs).
 *
 * Solicitação é diferente de Impedimento: não bloqueia necessariamente uma
 * tarefa, é qualquer pedido em acompanhamento até a conclusão — documento de
 * referência, informação complementar etc. Pode estar ligada a uma tarefa/
 * marco e a documentos, ou ser só do projeto (sem vínculo nenhum).
 */

import { startOfDayUTC } from "./tasks";

export type RequestStatus = "PENDING" | "ANSWERED" | "DISMISSED" | "EXPIRED";

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: "Pendente",
  ANSWERED: "Respondida",
  DISMISSED: "Cancelada",
  EXPIRED: "Expirada",
};

/** Mesma paleta de status das tarefas: verde concluído, laranja em aberto. */
export const REQUEST_STATUS_COLOR: Record<RequestStatus, string> = {
  PENDING: "bg-st-working",
  ANSWERED: "bg-st-done",
  DISMISSED: "bg-st-gray",
  EXPIRED: "bg-st-stuck",
};

export interface RequestDates {
  status: RequestStatus | string;
  dueAt: Date | null;
}

export function isRequestOpen(r: Pick<RequestDates, "status">): boolean {
  return r.status === "PENDING";
}

/** Atrasada = pendente e com prazo antes de hoje (o próprio dia ainda vale). */
export function isRequestOverdue(r: RequestDates, now: Date): boolean {
  if (!isRequestOpen(r) || !r.dueAt) return false;
  return startOfDayUTC(r.dueAt).getTime() < startOfDayUTC(now).getTime();
}

/** Dias em aberto (só interessa para pendente) — usado para ordenar/alertar. */
export function daysOpen(r: Pick<RequestDates, "dueAt"> & { createdAt: Date }, now: Date): number {
  const start = startOfDayUTC(r.createdAt).getTime();
  const today = startOfDayUTC(now).getTime();
  return Math.max(0, Math.round((today - start) / 86_400_000));
}
