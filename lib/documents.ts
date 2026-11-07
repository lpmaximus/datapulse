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
  | "CANCELLED"
  | "DELEGATION_REQUESTED"
  | "DELEGATION_ACCEPTED"
  | "DELEGATION_DECLINED"
  | "DELEGATION_CANCELLED";

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
  APPROVED_WITH_COMMENTS: "Aprovado com comentários",
  APPROVED: "Aprovação final",
  REVISED: "Nova revisão emitida",
  SUPERSEDED: "Substituído por revisão posterior",
  CANCELLED: "Cancelado",
  DELEGATION_REQUESTED: "Delegação da análise pedida",
  DELEGATION_ACCEPTED: "Delegação da análise aceita",
  DELEGATION_DECLINED: "Delegação da análise recusada",
  DELEGATION_CANCELLED: "Delegação da análise retirada",
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

/** Rótulo do documento que ainda está sendo elaborado (sem pacote de envio). */
export const PRODUCTION_LABEL = "Em produção";

/**
 * Revisão em produção: ainda em rascunho e sem pacote. "Emitida" fica para a
 * revisão que já está num pacote de envio; sem pacote o documento está sendo
 * elaborado pela projetista.
 */
export function isInProduction(r: {
  status: DocumentStatus;
  milestone?: unknown;
  milestoneId?: string | null;
}): boolean {
  if (r.status !== "DRAFT") return false;
  if ("milestoneId" in r) return !r.milestoneId;
  return !r.milestone;
}

/** Rótulo de status para exibição, distinguindo "Em produção" de "Emitida". */
export function revisionStatusLabel(status: DocumentStatus, inProduction = false): string {
  return status === "DRAFT" && inProduction ? PRODUCTION_LABEL : STATUS_LABEL[status] ?? status;
}

export const EFFECT_LABEL: Record<AnalysisEffect, string> = {
  APPROVES: "Aprova e encerra a revisão",
  APPROVES_WITH_COMMENTS: "Aprova com comentários — exige nova revisão",
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
  // Aprovado com comentários libera o uso, mas o documento ainda precisa ser
  // corrigido: volta ao emissor como o comentado e exige a próxima revisão.
  // O parecer (código e ação no histórico) guarda que houve aprovação.
  APPROVED_WITH_COMMENTS: "COMMENTED",
  APPROVED: "APPROVED",
  REVISED: "DRAFT",
  SUPERSEDED: "SUPERSEDED",
  CANCELLED: "CANCELLED",
  // Delegar a análise não muda o status da revisão: ela segue em análise.
  DELEGATION_REQUESTED: "IN_REVIEW",
  DELEGATION_ACCEPTED: "IN_REVIEW",
  DELEGATION_DECLINED: "IN_REVIEW",
  DELEGATION_CANCELLED: "IN_REVIEW",
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
    if (
      t.action === "COMMENTED" ||
      t.action === "REJECTED" ||
      t.action === "APPROVED_WITH_COMMENTS"
    ) {
      reworkCount += 1;
      totalDaysInReview += t.daysInPreviousStage ?? 0;
    }
    if (t.action === "APPROVED") {
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

/* ------------------------------------------------------------------------ */
/* Pacote de revisão (Tarefa) — estado projetado a partir das revisões       */
/* ------------------------------------------------------------------------ */

export interface PackageRevisionInput {
  status: DocumentStatus;
  dueAt: Date | null;
  analyzedAt: Date | null;
  /**
   * Existe revisão posterior do mesmo documento? Comentada/reprovada só fecha
   * o trabalho deste pacote quando a nova revisão já foi emitida (em outro
   * pacote); antes disso a bola está com o emissor e o pacote segue aberto.
   */
  hasSuccessor: boolean;
}

export interface PackageProjection {
  status: "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE" | "CANCELLED";
  /** 0–100: revisões do pacote com parecer final ÷ revisões ativas. */
  progress: number;
  /** Maior prazo entre as revisões ainda abertas. */
  forecastDate: Date | null;
  /** Só preenchido quando o pacote está concluído: último parecer. */
  actualDate: Date | null;
}

/** Revisão com parecer final dentro do pacote (não depende mais dele). */
export function isFinalInPackage(r: PackageRevisionInput): boolean {
  if (r.status === "APPROVED" || r.status === "SUPERSEDED") return true;
  if (r.status === "COMMENTED" || r.status === "REJECTED") return r.hasSuccessor;
  return false;
}

/**
 * Estado da Tarefa-pacote a partir das revisões que ela contém. Não é digitado:
 * é a soma do que existe dentro, no mesmo espírito do rollup do Marco.
 *
 * - Todas canceladas → Cancelada (cancelada não conta no avanço).
 * - Todas com parecer final → Concluída.
 * - Todas em rascunho → A fazer.
 * - Nada pendente com o emissor e ao menos uma em análise → Em revisão.
 * - Demais casos com movimento → Em andamento.
 * - Impedimento ativo na tarefa → Impedida (exceto se já concluída/cancelada).
 */
export function projectPackageStatus(
  revisions: PackageRevisionInput[],
  opts: { blocked?: boolean } = {},
): PackageProjection {
  const active = revisions.filter((r) => r.status !== "CANCELLED");

  if (revisions.length === 0) {
    return { status: "NOT_STARTED", progress: 0, forecastDate: null, actualDate: null };
  }
  if (active.length === 0) {
    return { status: "CANCELLED", progress: 0, forecastDate: null, actualDate: null };
  }

  const finals = active.filter(isFinalInPackage);
  const open = active.filter((r) => !isFinalInPackage(r));
  const progress = Math.round((finals.length / active.length) * 100);

  const dues = open.map((r) => r.dueAt).filter((d): d is Date => !!d);
  const forecastDate = dues.length ? new Date(Math.max(...dues.map((d) => d.getTime()))) : null;

  if (open.length === 0) {
    const analyzed = active.map((r) => r.analyzedAt).filter((d): d is Date => !!d);
    const actualDate = analyzed.length
      ? new Date(Math.max(...analyzed.map((d) => d.getTime())))
      : null;
    return { status: "DONE", progress: 100, forecastDate: null, actualDate };
  }

  if (opts.blocked) {
    return { status: "BLOCKED", progress, forecastDate, actualDate: null };
  }

  const anyInReview = open.some((r) => r.status === "IN_REVIEW");
  const pendingWithIssuer = open.some((r) => r.status !== "IN_REVIEW");
  const allDraft = open.length === active.length && open.every((r) => r.status === "DRAFT");

  const status: PackageProjection["status"] = allDraft
    ? "NOT_STARTED"
    : anyInReview && !pendingWithIssuer
      ? "IN_REVIEW"
      : "IN_PROGRESS";

  return { status, progress, forecastDate, actualDate: null };
}

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

/* ------------------------- data informada da ação ------------------------- */

/** Fuso de referência para "hoje" nas datas digitadas. */
const ACTION_TIME_ZONE = "America/Sao_Paulo";

/** AAAA-MM-DD do instante no fuso de referência. */
export function localDay(d: Date, timeZone = ACTION_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type ActionDateResult = { at: Date } | { error: string };

/**
 * Converte a data digitada no formulário de trâmite (envio, parecer) no
 * instante gravado no histórico.
 *
 * - Vazia ou igual a hoje: vale o instante atual (registro feito na hora).
 * - Dia passado: meio-dia de Brasília (15:00 UTC) daquele dia, para a data
 *   não "pular" de dia em nenhuma tela, seja ela exibida em UTC ou no fuso local.
 * - Futuro: recusada. Antes do evento anterior (`floor`): recusada; no mesmo
 *   dia do evento anterior, nunca fica antes dele, para a ordem do histórico
 *   e a contagem de dias não inverterem.
 */
export function resolveActionDate(
  input: string,
  now: Date,
  floor: Date | null | undefined,
  floorLabel = "o evento anterior",
): ActionDateResult {
  const value = input.trim();
  const today = localDay(now);
  if (!value || value === today) return { at: now };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: "Data inválida." };
  const at = new Date(`${value}T15:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || localDay(at) !== value) {
    return { error: "Data inválida." };
  }
  if (value > today) return { error: "A data não pode ser futura." };

  if (floor) {
    const floorDay = localDay(floor);
    if (value < floorDay) {
      const [y, m, d] = floorDay.split("-");
      return { error: `A data não pode ser anterior a ${floorLabel} (${d}/${m}/${y}).` };
    }
    if (at.getTime() < floor.getTime()) return { at: new Date(floor.getTime() + 1000) };
  }
  return { at };
}

/**
 * Piso da data de envio para análise.
 *
 * Só conta o que de fato aconteceu com o documento: o desfecho da revisão
 * anterior e eventos de trâmite desta revisão. Os eventos de cadastro
 * (CREATED / REVISED) registram quando alguém digitou o documento no sistema,
 * não quando ele foi feito — por isso não barram um envio passado: documento
 * já feito e enviado antes de existir no DataPulse precisa poder ser lançado
 * com a data real.
 */
export function submissionFloor(
  events: { action: DocumentAction; createdAt: Date }[],
  predecessorOutcomeAt: Date | null | undefined,
): Date | null {
  const times = events
    .filter((e) => !isRegistrationEvent(e.action))
    .map((e) => e.createdAt.getTime());
  if (predecessorOutcomeAt) times.push(predecessorOutcomeAt.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** Evento que marca o cadastro da revisão no sistema, não um passo do trâmite. */
export function isRegistrationEvent(action: DocumentAction): boolean {
  return action === "CREATED" || action === "REVISED";
}

/* --------------------------- formato da folha --------------------------- */

export type SheetFormat = "A4" | "A3" | "A2" | "A1" | "A0";

/** Do menor para o maior — ordem das listas de escolha. */
export const SHEET_FORMATS: SheetFormat[] = ["A4", "A3", "A2", "A1", "A0"];

/**
 * Peso de cada formato em A1 equivalente: cada formato tem o dobro da área
 * do anterior. É a unidade de medida da produção de desenhos.
 */
export const SHEET_FORMAT_A1: Record<SheetFormat, number> = {
  A4: 0.125,
  A3: 0.25,
  A2: 0.5,
  A1: 1,
  A0: 2,
};

/** Valor vindo de formulário ou planilha → formato válido, ou nulo. */
export function parseSheetFormat(value: unknown): SheetFormat | null {
  const v = String(value ?? "").trim().toUpperCase();
  return (SHEET_FORMATS as string[]).includes(v) ? (v as SheetFormat) : null;
}

/** Quantidade de folhas vinda do formulário: inteiro ≥ 1; vazio ou inválido = 1. */
export function parseSheetCount(value: unknown): number {
  const n = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, 100_000) : 1;
}

/**
 * A1 equivalente do documento: peso do formato × quantidade de folhas.
 * Nulo quando o formato não foi informado.
 */
export function a1Equivalent(
  format: SheetFormat | null | undefined,
  sheetCount: number | null | undefined = 1,
): number | null {
  if (!format) return null;
  const count = sheetCount && sheetCount > 0 ? sheetCount : 1;
  return SHEET_FORMAT_A1[format] * count;
}

/** Soma em A1 equivalente e quantos documentos ficaram sem formato. */
export function sumA1Equivalent(
  docs: { sheetFormat?: SheetFormat | null; sheetCount?: number | null }[],
): { total: number; withFormat: number; missing: number } {
  let total = 0;
  let withFormat = 0;
  for (const d of docs) {
    const v = a1Equivalent(d.sheetFormat, d.sheetCount);
    if (v == null) continue;
    total += v;
    withFormat += 1;
  }
  return { total, withFormat, missing: docs.length - withFormat };
}

/** 0,125 · 1 · 12,5 — formato pt-BR, sem zeros à direita. */
export function formatA1(value: number): string {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
