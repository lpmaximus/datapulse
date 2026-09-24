/**
 * Regras de Reunião (ata) — puro, sem Prisma nem Next.
 *
 * Tópicos seguem as seções da ata da MRS: Assuntos Gerais, Planejamento,
 * Engenharia e Outros, nessa ordem. `category` continua texto no banco;
 * qualquer valor fora da lista (ou em branco) cai em "OUTROS".
 */

export const MEETING_TOPIC_CATEGORIES = [
  "ASSUNTOS GERAIS",
  "PLANEJAMENTO",
  "ENGENHARIA",
  "OUTROS",
] as const;

/** Opções do seletor de categoria no formulário. */
export const MEETING_TOPIC_CATEGORY_OPTIONS = MEETING_TOPIC_CATEGORIES;

/**
 * Coluna "Responsável" da ata MRS: o nome quando o item tem dono; sem dono,
 * o próprio status (ex.: "INFORMATIVO"), como no formulário do cliente.
 */
export function topicResponsibleLabel(t: { responsible: string | null; status: string }): string {
  return t.responsible?.trim() || t.status;
}

/** "ASSUNTOS GERAIS" -> "Assuntos Gerais" — rótulo das barras de seção da ata. */
export function meetingCategoryLabel(category: string): string {
  return category
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const MEETING_TOPIC_STATUSES = ["INFORMATIVO", "PENDENTE", "CONCLUÍDO", "CANCELADO"] as const;

export const MEETING_TOPIC_STATUS_COLOR: Record<string, string> = {
  INFORMATIVO: "bg-st-gray",
  PENDENTE: "bg-st-working",
  CONCLUÍDO: "bg-st-done",
  CANCELADO: "bg-st-gray",
};

import { startOfDayUTC } from "./tasks";

/**
 * Reunião "realizada" = a ata tem conteúdo (pelo menos um tópico
 * registrado); sem isso, é só um horário reservado na agenda — "agendada".
 * Sem campo de status à parte: deriva do que já está gravado, no mesmo
 * espírito de `isRequestOpen`/`isTaskOpen`.
 */
export function isMeetingHeld(topicsCount: number): boolean {
  return topicsCount > 0;
}

/** Agendada, com a data já passada e ninguém preencheu a ata ainda. */
export function isMeetingOverdueToLog(date: Date, topicsCount: number, now: Date): boolean {
  return !isMeetingHeld(topicsCount) && startOfDayUTC(date).getTime() < startOfDayUTC(now).getTime();
}

export type MeetingState = "scheduled" | "overdue" | "held";

export function meetingState(date: Date, topicsCount: number, now: Date): MeetingState {
  if (isMeetingHeld(topicsCount)) return "held";
  if (isMeetingOverdueToLog(date, topicsCount, now)) return "overdue";
  return "scheduled";
}

export const MEETING_STATE_LABEL: Record<MeetingState, string> = {
  scheduled: "Agendada",
  overdue: "Agendada — ata pendente",
  held: "Realizada",
};

export const MEETING_STATE_COLOR: Record<MeetingState, string> = {
  scheduled: "bg-st-gray",
  overdue: "bg-st-stuck",
  held: "bg-st-done",
};

export interface TopicLike {
  category: string | null;
  order?: number;
}

/**
 * Agrupa tópicos pela ordem fixa das seções da ata — cada seção aparece
 * mesmo vazia (o modelo impresso sempre lista as 4); categoria em branco ou
 * fora da lista entra em "OUTROS".
 */
export function groupTopicsByCategory<T extends TopicLike>(
  topics: T[],
): { category: string; items: T[] }[] {
  const byCategory = new Map<string, T[]>();
  for (const t of topics) {
    const key = t.category?.trim().toUpperCase() || "";
    const arr = byCategory.get(key) ?? [];
    arr.push(t);
    byCategory.set(key, arr);
  }

  const groups: { category: string; items: T[] }[] = MEETING_TOPIC_CATEGORIES.map((c) => ({
    category: c,
    items: byCategory.get(c) ?? [],
  }));
  for (const c of MEETING_TOPIC_CATEGORIES) byCategory.delete(c);
  // Sobra: sem categoria (branco) ou fora da lista — vai para "OUTROS",
  // depois dos que já estavam lá, mantendo a ordem de cadastro.
  const outros = groups.find((g) => g.category === "OUTROS")!;
  for (const arr of byCategory.values()) outros.items.push(...arr);
  outros.items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return groups;
}
