/**
 * Regras de Reunião (ata) — puro, sem Prisma nem Next.
 *
 * Tópicos seguem o padrão de ata por disciplina do formulário do cliente:
 * Segurança, Meio Ambiente, Qualidade, Planejamento, Engenharia, nessa
 * ordem, com qualquer outra categoria (ou em branco) ao final. `category` é
 * texto livre no MVP (mesmo padrão de Document.type/Request.type) — esta
 * ordem é só de exibição, não trava o cadastro.
 */

export const MEETING_TOPIC_CATEGORIES = [
  "SEGURANÇA",
  "MEIO AMBIENTE",
  "QUALIDADE",
  "PLANEJAMENTO",
  "ENGENHARIA",
] as const;

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
 * Agrupa tópicos pela ordem fixa das categorias do formulário do cliente —
 * cada categoria aparece mesmo vazia (o modelo impresso sempre lista as 5),
 * com "Outros" ao final só quando alguém usou uma categoria fora da lista.
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
  // Sobra: sem categoria (branco) ou categoria fora da lista padrão — tudo
  // junto em "Outros", só aparece quando existe algo para mostrar.
  const rest: T[] = [];
  for (const arr of byCategory.values()) rest.push(...arr);
  if (rest.length > 0) groups.push({ category: "OUTROS", items: rest });
  return groups;
}
