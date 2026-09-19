/**
 * Regras do fluxo de análise documental.
 *
 * Módulo puro: decide o que cada ação produz. Sem Prisma nem rede, para ser
 * testável isoladamente e recalibrável sem tocar no banco.
 *
 * Mudança de desenho: o parecer da análise não é mais um enum fixo no código.
 * Vem de `AnalysisCode` (TBL_COD_ANALISE), que o cliente configura. O que o
 * código-fonte precisa saber é apenas o EFEITO de cada parecer sobre o fluxo —
 * daí o enum `AnalysisEffect`, que é pequeno e estável.
 */

export type DocumentStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "COMMENTED"
  | "REJECTED"
  | "SUPERSEDED"
  | "CANCELLED";

export type DocumentAction =
  | "CREATED"
  | "SUBMITTED"
  | "COMMENTED"
  | "REJECTED"
  | "APPROVED_WITH_COMMENTS"
  | "APPROVED"
  | "REVISED"
  | "SUPERSEDED"
  | "CANCELLED";

export type AnalysisEffect =
  | "APPROVES"
  | "APPROVES_WITH_COMMENTS"
  | "COMMENTS"
  | "REJECTS"
  | "CANCELS";

export interface AnalysisCodeLike {
  id: string;
  tag: string;
  name: string;
  effect: AnalysisEffect;
}

export const ACTION_LABEL: Record<DocumentAction, string> = {
  CREATED: "Documento criado",
  SUBMITTED: "Emitido para análise",
  COMMENTED: "Analisado com comentários",
  REJECTED: "Reprovado",
  APPROVED_WITH_COMMENTS: "Aprovado com ressalvas",
  APPROVED: "Aprovação final",
  REVISED: "Nova revisão emitida",
  SUPERSEDED: "Substituído por revisão posterior",
  CANCELLED: "Cancelado",
};

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  DRAFT: "Emitida",
  IN_REVIEW: "Em análise",
  APPROVED: "Aprovada",
  COMMENTED: "Comentada",
  REJECTED: "Reprovada",
  SUPERSEDED: "Substituída",
  CANCELLED: "Cancelada",
};

export const EFFECT_LABEL: Record<AnalysisEffect, string> = {
  APPROVES: "Aprova e encerra a revisão",
  APPROVES_WITH_COMMENTS: "Aprova com ressalvas",
  COMMENTS: "Devolve ao emissor com comentários",
  REJECTS: "Reprova e devolve ao emissor",
  CANCELS: "Cancela o documento",
};

/** Tradução do efeito configurado para a ação registrada no histórico. */
const EFFECT_TO_ACTION: Record<AnalysisEffect, DocumentAction> = {
  APPROVES: "APPROVED",
  APPROVES_WITH_COMMENTS: "APPROVED_WITH_COMMENTS",
  COMMENTS: "COMMENTED",
  REJECTS: "REJECTED",
  CANCELS: "CANCELLED",
};

export function actionForEffect(effect: AnalysisEffect): DocumentAction {
  return EFFECT_TO_ACTION[effect];
}

const ACTION_TO_STATUS: Record<DocumentAction, DocumentStatus> = {
  CREATED: "DRAFT",
  SUBMITTED: "IN_REVIEW",
  COMMENTED: "COMMENTED",
  REJECTED: "REJECTED",
  APPROVED_WITH_COMMENTS: "APPROVED",
  APPROVED: "APPROVED",
  REVISED: "DRAFT",
  SUPERSEDED: "SUPERSEDED",
  CANCELLED: "CANCELLED",
};

export function statusAfter(action: DocumentAction): DocumentStatus {
  return ACTION_TO_STATUS[action];
}

/**
 * Ações válidas a partir de cada status de revisão.
 *
 * REGRA CENTRAL: a revisão é o pacote de envio da projetista ao cliente.
 * Todo trâmite é uma revisão nova — por isso uma revisão JÁ ANALISADA é
 * terminal e nunca aceita reenvio. Comentada ou reprovada, o caminho é emitir
 * a próxima revisão, que nasce como outro registro.
 *
 * Consequência prática: a sequência de revisões É o histórico da análise.
 * Contar revisões = contar quantas idas e vindas o documento exigiu.
 */
const ALLOWED: Record<DocumentStatus, DocumentAction[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  IN_REVIEW: ["COMMENTED", "REJECTED", "APPROVED_WITH_COMMENTS", "APPROVED", "CANCELLED"],
  APPROVED: [],
  COMMENTED: [],
  REJECTED: [],
  SUPERSEDED: [],
  CANCELLED: [],
};

export function allowedActions(status: DocumentStatus): DocumentAction[] {
  return ALLOWED[status] ?? [];
}

export function isActionAllowed(
  status: DocumentStatus,
  action: DocumentAction,
): boolean {
  return allowedActions(status).includes(action);
}

/** Pareceres aplicáveis quando a revisão está em análise. */
export function applicableCodes(
  status: DocumentStatus,
  codes: AnalysisCodeLike[],
): AnalysisCodeLike[] {
  if (status !== "IN_REVIEW") return [];
  return codes.filter((c) => isActionAllowed(status, actionForEffect(c.effect)));
}

/** Revisão encerrada: analisada, substituída ou cancelada. Não aceita ação. */
export function isRevisionClosed(status: DocumentStatus): boolean {
  return allowedActions(status).length === 0;
}

/** A revisão ainda está em curso (emitida ou em análise). */
export function isRevisionOpen(status: DocumentStatus): boolean {
  return status === "DRAFT" || status === "IN_REVIEW";
}

/** O desfecho encerrou o documento com aprovação. */
export function isApproved(status: DocumentStatus): boolean {
  return status === "APPROVED";
}

/**
 * Desfecho que obriga a projetista a emitir a próxima revisão.
 * É o contador natural de retrabalho.
 */
export function requiresNewRevision(status: DocumentStatus): boolean {
  return status === "COMMENTED" || status === "REJECTED";
}

/**
 * Ciclo dentro de uma revisão.
 *
 * Como cada revisão é analisada uma única vez, na prática o ciclo é sempre 1.
 * A função permanece para o histórico antigo continuar legível e para o caso
 * de o fluxo do cliente permitir reenvio no futuro.
 */
export function nextRound(currentRound: number, action: DocumentAction): number {
  return action === "SUBMITTED" ? currentRound + 1 : currentRound;
}

/** Nome sugerido para a próxima revisão: R00 → R01 → R02. */
export function nextRevisionName(previous: string | null | undefined): string {
  if (!previous) return "R00";

  const match = previous.match(/^([A-Za-z_-]*)(\d+)$/);
  if (match) {
    const [, prefix, digits] = match;
    const next = String(Number(digits) + 1).padStart(digits.length, "0");
    return `${prefix}${next}`;
  }

  // Revisão por letra: A → B → C.
  if (/^[A-Za-z]$/.test(previous)) {
    const code = previous.toUpperCase().charCodeAt(0);
    if (code < 90) return String.fromCharCode(code + 1);
  }

  return `${previous}-1`;
}

const DAY_MS = 86_400_000;

export function daysBetween(later: Date, earlier: Date | null | undefined): number | null {
  if (!earlier) return null;
  const diff = Math.floor((later.getTime() - earlier.getTime()) / DAY_MS);
  return diff < 0 ? 0 : diff;
}

export interface TransitionLike {
  action: DocumentAction;
  round: number;
  daysInPreviousStage: number | null;
}

export interface CycleSummary {
  rounds: number;
  totalDaysInReview: number;
  reworkCount: number;
}

/**
 * Resume o histórico. Muitos retrabalhos com muitos dias em análise é o padrão
 * que antecede o atraso do marco — é isso que queremos tornar visível.
 */
export function summarizeCycles(transitions: TransitionLike[]): CycleSummary {
  let totalDaysInReview = 0;
  let reworkCount = 0;
  let rounds = 0;

  for (const t of transitions) {
    if (t.round > rounds) rounds = t.round;
    if (t.action === "COMMENTED" || t.action === "REJECTED") {
      reworkCount += 1;
      totalDaysInReview += t.daysInPreviousStage ?? 0;
    }
    if (t.action === "APPROVED" || t.action === "APPROVED_WITH_COMMENTS") {
      totalDaysInReview += t.daysInPreviousStage ?? 0;
    }
  }

  return { rounds, totalDaysInReview, reworkCount };
}

/* ------------------------------ passagens ------------------------------ */

/** Evento do histórico, no formato mínimo que a leitura de passagens precisa. */
export interface PassageTransition {
  id: string;
  action: DocumentAction;
  round: number;
  analysisCodeTag: string | null;
  actorName: string | null;
  assignedToName: string | null;
  comment: string | null;
  dueAt: Date | null;
  createdAt: Date;
  revision: { id: string; name: string };
}

/**
 * Uma passagem = uma ida do documento para análise e a volta dela.
 *
 * O mesmo documento pode entrar no sistema várias vezes, em períodos
 * diferentes, até a aprovação. Cada entrada é uma passagem: quando foi
 * enviado, quem analisou, em que prazo, quando voltou e com qual parecer.
 * Uma passagem sem retorno é a que está em análise agora.
 */
export interface Passage {
  /** Ordem cronológica, a partir de 1. */
  number: number;
  revisionId: string;
  revisionName: string;
  /** Envio dentro da revisão (a mesma revisão pode ser analisada de novo). */
  round: number;
  sentAt: Date;
  dueAt: Date | null;
  analyst: string | null;
  sentComment: string | null;
  /** Nulo enquanto a passagem está em análise. */
  outcome: DocumentAction | null;
  analysisTag: string | null;
  returnedAt: Date | null;
  returnedBy: string | null;
  returnComment: string | null;
  /** Dias na análise: até o retorno, ou até `now` se ainda está em curso. */
  days: number;
  open: boolean;
}

const PASSAGE_CLOSERS: DocumentAction[] = [
  "COMMENTED",
  "REJECTED",
  "APPROVED_WITH_COMMENTS",
  "APPROVED",
  "CANCELLED",
];

/**
 * Reconstrói as passagens a partir do histórico (append-only). Nada é
 * gravado à parte: o histórico já é a verdade, e a lista de passagens é só
 * uma leitura dele — por isso vale igual para documentos digitados no app e
 * para os carregados da planilha de controle.
 *
 * Cada SUBMITTED abre uma passagem; o primeiro desfecho da mesma revisão e
 * do mesmo envio a fecha. Eventos de criação, nova revisão e substituição
 * não são passagens.
 */
export function buildPassages(transitions: PassageTransition[], now: Date): Passage[] {
  const ordered = transitions
    .map((t, i) => ({ t, i }))
    .sort((a, b) => a.t.createdAt.getTime() - b.t.createdAt.getTime() || a.i - b.i)
    .map((x) => x.t);

  const passages: Passage[] = [];
  const openByKey = new Map<string, Passage>();

  for (const t of ordered) {
    const key = `${t.revision.id}:${t.round}`;

    if (t.action === "SUBMITTED") {
      const p: Passage = {
        number: passages.length + 1,
        revisionId: t.revision.id,
        revisionName: t.revision.name,
        round: t.round,
        sentAt: t.createdAt,
        dueAt: t.dueAt,
        analyst: t.assignedToName,
        sentComment: t.comment,
        outcome: null,
        analysisTag: null,
        returnedAt: null,
        returnedBy: null,
        returnComment: null,
        days: daysBetween(now, t.createdAt) ?? 0,
        open: true,
      };
      passages.push(p);
      openByKey.set(key, p);
      continue;
    }

    if (PASSAGE_CLOSERS.includes(t.action)) {
      const p = openByKey.get(key);
      if (!p) continue; // desfecho sem envio (ex.: cancelar antes de enviar)
      p.outcome = t.action;
      p.analysisTag = t.analysisCodeTag;
      p.returnedAt = t.createdAt;
      p.returnedBy = t.actorName;
      p.returnComment = t.comment;
      p.days = daysBetween(t.createdAt, p.sentAt) ?? 0;
      p.open = false;
      openByKey.delete(key);
    }
  }

  return passages;
}

/** Códigos padrão criados pelo seed — refletem o rascunho do modelo. */
export const DEFAULT_ANALYSIS_CODES: {
  tag: string;
  name: string;
  effect: AnalysisEffect;
  sortOrder: number;
}[] = [
  { tag: "APR", name: "Aprovado", effect: "APPROVES", sortOrder: 1 },
  { tag: "REJ", name: "Rejeitado", effect: "REJECTS", sortOrder: 2 },
  { tag: "COM", name: "Comentado", effect: "COMMENTS", sortOrder: 3 },
  { tag: "CLD", name: "Cancelado", effect: "CANCELS", sortOrder: 4 },
];

/**
 * Filtro de busca da lista documental, compartilhado pela visão do projeto e
 * pela geral. Fica aqui para as duas telas procurarem pelos MESMOS campos —
 * quando cada página montava o próprio `where`, elas divergiram e passaram a
 * filtrar por colunas que o modelo já não tem.
 *
 * Busca por número, nome, tipo e disciplina (sigla ou nome) e, na visão
 * geral, também pelo nome do projeto. Módulo puro: é só a forma do objeto,
 * sem importar Prisma.
 */
export function documentSearchFilter(q?: string, includeProject = false) {
  const term = q?.trim();
  if (!term) return {};

  const like = { contains: term, mode: "insensitive" as const };

  const OR: Record<string, unknown>[] = [
    { number: like },
    { name: like },
    { type: like },
    { discipline: { tag: like } },
    { discipline: { name: like } },
  ];
  // Na visão geral o projeto também é um critério útil de busca; dentro do
  // projeto seria redundante.
  if (includeProject) OR.push({ project: { name: like } });

  return { OR };
}
