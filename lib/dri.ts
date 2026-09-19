/**
 * Motor do DRI (DataPulse Restriction Index) — versão MVP.
 *
 * Módulo puro e sem dependências: recebe dados simples e devolve o score.
 * Isso mantém a fórmula testável isoladamente e fácil de recalibrar depois
 * da Semana 6, quando houver dados reais do piloto.
 *
 * Princípio TOC: o índice não mede "risco geral", mede *onde o projeto trava*.
 * Por isso o score do projeto é dominado pelo pior marco, não pela média.
 */

export type Criticality = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface HumanSignalInput {
  /** 0-100 */
  failureProbability: number;
  /** 1 (nenhuma) a 5 (total) */
  planConfidence: number;
  blockedDecision?: boolean;
  createdAt: Date;
}

export interface SystemicSignalInput {
  referenceDate: Date;
  plannedDate?: Date | null;
  actualDate?: Date | null;
  delayDays?: number | null;
  plannedCost?: number | null;
  actualCost?: number | null;
  openIssues?: number | null;
  replanCount?: number | null;
}

/**
 * Sinais operacionais: o que já está registrado no banco sobre quem trava a
 * tarefa (impedimentos, solicitações vencidas, revisões paradas em análise).
 * Entram na Camada 1 como componentes que só existem quando a condição existe:
 * ausência de impedimento não "esfria" um atraso de cronograma.
 */
export interface OperationalInput {
  /** Data de abertura de cada impedimento ainda não resolvido. */
  openImpedimentDates: Date[];
  /** Prazo de cada solicitação pendente (nulo = sem prazo declarado). */
  pendingRequestDueDates: (Date | null)[];
  /** Desde quando cada revisão do pacote está em análise. */
  reviewsInReviewSince: Date[];
  /** Maior nº de revisões entre os documentos do pacote (ciclos de retrabalho). */
  maxRevisionsPerDocument: number;
}

export interface MilestoneInput {
  id: string;
  name: string;
  criticality: Criticality;
  economicImpact?: number | null;
  plannedDate?: Date | null;
  forecastDate?: Date | null;
  actualDate?: Date | null;
  humanSignals: HumanSignalInput[];
  systemicSignals: SystemicSignalInput[];
  operational?: OperationalInput;
}

export interface Component {
  value: number;
  weight: number;
}

export interface DRIResult {
  score: number;
  humanScore: number | null;
  systemicScore: number | null;
  /** 0-1: quanto das entradas previstas existe de fato. Score com confiança baixa é indicativo, não conclusivo. */
  confidence: number;
  /** Exposição econômica = score/100 * impacto econômico do marco. */
  economicExposure: number | null;
  breakdown: {
    human: Record<string, Component>;
    systemic: Record<string, Component>;
    criticalityFactor: number;
    humanWeight: number;
    systemicWeight: number;
    humanSignalCount: number;
    systemicSignalCount: number;
    calculatedAt: string;
    formulaVersion: string;
  };
}

export const FORMULA_VERSION = "mvp-2";

/** Janelas de normalização. Recalibrar após o piloto (Semana 6). */
export const DRI_CONFIG = {
  /** Sinais humanos mais antigos que isso são ignorados. */
  humanSignalWindowDays: 45,
  /** Atraso que já satura o componente de cronograma. */
  slipHorizonDays: 30,
  /** Estouro de custo que já satura o componente financeiro (20%). */
  costOverrunCap: 0.2,
  /** Dias sem sinal humano até o "silêncio" saturar. */
  silenceHorizonDays: 21,
  replanCap: 3,
  openIssuesCap: 20,
  /** Impedimento aberto há tanto tempo já satura o componente. */
  impedimentHorizonDays: 21,
  /** Solicitação vencida há tanto tempo já satura. */
  requestOverdueHorizonDays: 14,
  /** Revisão parada em análise há tanto tempo já satura. */
  reviewStallHorizonDays: 14,
  /** Nº de revisões de um mesmo documento que já satura o retrabalho (4 = 3 devoluções). */
  revisionCyclesCap: 4,
  criticalityFactor: {
    LOW: 0.85,
    MEDIUM: 1,
    HIGH: 1.15,
    CRITICAL: 1.3,
  } as Record<Criticality, number>,
};

const DAY_MS = 86_400_000;

export function clamp(n: number, min = 0, max = 100): number {
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / DAY_MS;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Combina componentes ponderados ignorando os ausentes e renormalizando os
 * pesos. Sem isso, um marco com dado parcial seria injustamente penalizado.
 */
function weightedBlend(components: Record<string, Component>): number | null {
  const entries = Object.values(components);
  const totalWeight = entries.reduce((acc, c) => acc + c.weight, 0);
  if (entries.length === 0 || totalWeight === 0) return null;
  return entries.reduce((acc, c) => acc + c.value * (c.weight / totalWeight), 0);
}

/** Camada 2 — percepção humana estruturada. */
export function computeHumanScore(
  signals: HumanSignalInput[],
  now: Date,
): { score: number | null; components: Record<string, Component>; used: number } {
  const fresh = signals.filter(
    (s) => daysBetween(now, s.createdAt) <= DRI_CONFIG.humanSignalWindowDays,
  );
  const components: Record<string, Component> = {};

  if (fresh.length === 0) {
    // Silêncio total ainda é sinal, mas fraco demais para sustentar um score.
    return { score: null, components, used: 0 };
  }

  const probs = fresh.map((s) => clamp(s.failureProbability));
  components.failureProbability = { value: mean(probs), weight: 0.4 };

  const lowConfidence = fresh.map(
    (s) => ((5 - clamp(s.planConfidence, 1, 5)) / 4) * 100,
  );
  components.lowPlanConfidence = { value: mean(lowConfidence), weight: 0.25 };

  const blockedShare =
    (fresh.filter((s) => s.blockedDecision).length / fresh.length) * 100;
  components.blockedDecisions = { value: blockedShare, weight: 0.15 };

  // Divergência entre respondentes: equipe que não concorda sobre o marco é
  // um leading indicator clássico de restrição não endereçada.
  const divergence = clamp((stdDev(probs) / 35) * 100);
  components.divergence = { value: divergence, weight: 0.1 };

  // Silêncio: tempo desde a última avaliação.
  const lastAt = Math.max(...fresh.map((s) => s.createdAt.getTime()));
  const silence = clamp(
    (daysBetween(now, new Date(lastAt)) / DRI_CONFIG.silenceHorizonDays) * 100,
  );
  components.silence = { value: silence, weight: 0.1 };

  return { score: weightedBlend(components), components, used: fresh.length };
}

/**
 * Componentes operacionais. Cada um só aparece quando a condição existe
 * (há impedimento, há solicitação vencida, há revisão em análise, há
 * documento devolvido) — a ausência não é evidência de saúde.
 */
export function computeOperationalComponents(
  op: OperationalInput | undefined,
  now: Date,
): Record<string, Component> {
  const components: Record<string, Component> = {};
  if (!op) return components;

  if (op.openImpedimentDates.length > 0) {
    const oldest = Math.max(...op.openImpedimentDates.map((d) => daysBetween(now, d)));
    components.openImpediment = {
      value: clamp((Math.max(0, oldest) / DRI_CONFIG.impedimentHorizonDays) * 100),
      weight: 0.35,
    };
  }

  const overdue = op.pendingRequestDueDates
    .filter((d): d is Date => !!d && d.getTime() < now.getTime())
    .map((d) => daysBetween(now, d));
  if (overdue.length > 0) {
    components.overdueRequests = {
      value: clamp((Math.max(...overdue) / DRI_CONFIG.requestOverdueHorizonDays) * 100),
      weight: 0.15,
    };
  }

  if (op.reviewsInReviewSince.length > 0) {
    const stalled = Math.max(...op.reviewsInReviewSince.map((d) => daysBetween(now, d)));
    components.reviewStall = {
      value: clamp((Math.max(0, stalled) / DRI_CONFIG.reviewStallHorizonDays) * 100),
      weight: 0.2,
    };
  }

  if (op.maxRevisionsPerDocument >= 2) {
    components.revisionCycles = {
      value: clamp(
        ((op.maxRevisionsPerDocument - 1) / (DRI_CONFIG.revisionCyclesCap - 1)) * 100,
      ),
      weight: 0.1,
    };
  }

  return components;
}

/** Camada 1 — desvio objetivo de cronograma e custo, mais sinais operacionais. */
export function computeSystemicScore(
  milestone: Pick<MilestoneInput, "plannedDate" | "forecastDate" | "actualDate">,
  signals: SystemicSignalInput[],
  now: Date,
  operational?: OperationalInput,
): { score: number | null; components: Record<string, Component>; used: number } {
  const components: Record<string, Component> = {};
  const latest = [...signals].sort(
    (a, b) => b.referenceDate.getTime() - a.referenceDate.getTime(),
  )[0];

  const plannedDate = latest?.plannedDate ?? milestone.plannedDate ?? null;
  const actualDate = latest?.actualDate ?? milestone.actualDate ?? null;
  // Tarefa aberta cuja previsão já passou não "termina" no dia previsto: ela
  // continua atrasada até alguém concluir ou reprogramar. Sem isso, prazo
  // vencido sem reprogramação teria atraso zero.
  const forecast = milestone.forecastDate;
  const effectiveDate =
    actualDate ?? (forecast && forecast.getTime() > now.getTime() ? forecast : now);

  let slipDays: number | null = null;
  if (latest?.delayDays != null) {
    slipDays = latest.delayDays;
  } else if (plannedDate) {
    slipDays = daysBetween(effectiveDate, plannedDate);
  }
  if (slipDays != null) {
    components.scheduleSlip = {
      value: clamp((Math.max(0, slipDays) / DRI_CONFIG.slipHorizonDays) * 100),
      weight: 0.45,
    };
  }

  if (latest?.plannedCost != null && latest.plannedCost > 0 && latest.actualCost != null) {
    const overrun = (latest.actualCost - latest.plannedCost) / latest.plannedCost;
    components.costOverrun = {
      value: clamp((Math.max(0, overrun) / DRI_CONFIG.costOverrunCap) * 100),
      weight: 0.3,
    };
  }

  if (latest?.replanCount != null) {
    components.replans = {
      value: clamp((latest.replanCount / DRI_CONFIG.replanCap) * 100),
      weight: 0.15,
    };
  }

  if (latest?.openIssues != null) {
    components.openIssues = {
      value: clamp((latest.openIssues / DRI_CONFIG.openIssuesCap) * 100),
      weight: 0.1,
    };
  }

  Object.assign(components, computeOperationalComponents(operational, now));

  return {
    score: weightedBlend(components),
    components,
    used: signals.length,
  };
}

/** DRI de um marco. */
export function computeMilestoneDRI(
  milestone: MilestoneInput,
  now: Date = new Date(),
): DRIResult {
  const human = computeHumanScore(milestone.humanSignals, now);
  const systemic = computeSystemicScore(
    milestone,
    milestone.systemicSignals,
    now,
    milestone.operational,
  );

  // Marco já entregue não é restrição: o gargalo está adiante.
  if (milestone.actualDate && milestone.actualDate.getTime() <= now.getTime()) {
    return {
      score: 0,
      humanScore: human.score,
      systemicScore: systemic.score,
      confidence: 1,
      economicExposure: 0,
      breakdown: {
        human: human.components,
        systemic: systemic.components,
        criticalityFactor: DRI_CONFIG.criticalityFactor[milestone.criticality],
        humanWeight: 0,
        systemicWeight: 0,
        humanSignalCount: human.used,
        systemicSignalCount: systemic.used,
        calculatedAt: now.toISOString(),
        formulaVersion: FORMULA_VERSION + " (concluído)",
      },
    };
  }

  let humanWeight = human.score == null ? 0 : 0.5;
  let systemicWeight = systemic.score == null ? 0 : 0.5;
  const total = humanWeight + systemicWeight;
  if (total > 0) {
    humanWeight /= total;
    systemicWeight /= total;
  }

  const base =
    total === 0
      ? 0
      : (human.score ?? 0) * humanWeight + (systemic.score ?? 0) * systemicWeight;

  const factor = DRI_CONFIG.criticalityFactor[milestone.criticality] ?? 1;
  const score = Math.round(clamp(base * factor) * 10) / 10;

  // Confiança: metade por ter sinal humano, metade por ter sinal sistêmico,
  // com bônus por pluralidade de respondentes.
  const confidence =
    (human.score != null ? 0.4 : 0) +
    (systemic.score != null ? 0.4 : 0) +
    Math.min(0.2, human.used * 0.05);

  const economicExposure =
    milestone.economicImpact != null
      ? Math.round((score / 100) * milestone.economicImpact * 100) / 100
      : null;

  return {
    score,
    humanScore: human.score == null ? null : Math.round(human.score * 10) / 10,
    systemicScore:
      systemic.score == null ? null : Math.round(systemic.score * 10) / 10,
    confidence: Math.round(confidence * 100) / 100,
    economicExposure,
    breakdown: {
      human: human.components,
      systemic: systemic.components,
      criticalityFactor: factor,
      humanWeight: Math.round(humanWeight * 100) / 100,
      systemicWeight: Math.round(systemicWeight * 100) / 100,
      humanSignalCount: human.used,
      systemicSignalCount: systemic.used,
      calculatedAt: now.toISOString(),
      formulaVersion: FORMULA_VERSION,
    },
  };
}

/**
 * DRI do projeto. Deliberadamente NÃO é a média dos marcos.
 * Sob TOC, o sistema é limitado pela restrição dominante — por isso o pior
 * marco domina (70%), com um termo de contexto ponderado por impacto
 * econômico (30%) para distinguir "um gargalo isolado" de "vários gargalos".
 */
export function computeProjectDRI(
  results: { score: number; economicImpact?: number | null }[],
): { score: number; dominant: number; contextual: number } {
  if (results.length === 0) return { score: 0, dominant: 0, contextual: 0 };

  const dominant = Math.max(...results.map((r) => r.score));

  const totalImpact = results.reduce((a, r) => a + (r.economicImpact ?? 0), 0);
  const contextual =
    totalImpact > 0
      ? results.reduce(
          (a, r) => a + r.score * ((r.economicImpact ?? 0) / totalImpact),
          0,
        )
      : mean(results.map((r) => r.score));

  return {
    score: Math.round(clamp(dominant * 0.7 + contextual * 0.3) * 10) / 10,
    dominant: Math.round(dominant * 10) / 10,
    contextual: Math.round(contextual * 10) / 10,
  };
}

/**
 * DRI de um Marco que agrupa tarefas: o pior das filhas. O marco só é tão
 * saudável quanto sua restrição mais forte (TOC) — não é média, e não soma de
 * novo o atraso que já está contado na filha.
 */
export function aggregateGroupDRI(
  children: { name: string; score: number }[],
): { score: number; dominantChild: string | null; childCount: number } {
  if (children.length === 0) return { score: 0, dominantChild: null, childCount: 0 };
  const top = children.reduce((a, b) => (b.score > a.score ? b : a));
  return { score: top.score, dominantChild: top.name, childCount: children.length };
}

export type DRIBand = "low" | "watch" | "high" | "critical";

export function driBand(score: number): DRIBand {
  if (score >= 75) return "critical";
  if (score >= 55) return "high";
  if (score >= 35) return "watch";
  return "low";
}

export const BAND_LABEL: Record<DRIBand, string> = {
  low: "Estável",
  watch: "Atenção",
  high: "Restrição provável",
  critical: "Restrição dominante",
};
