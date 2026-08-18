/**
 * View-models das consultas Prisma.
 *
 * Por que existem: os componentes precisam de tipos explícitos para os
 * resultados das queries. Estes tipos são deliberadamente *mais largos* que os
 * do client gerado — `unknown` onde o Prisma devolve `Decimal`/`Json` — para
 * que a atribuição continue válida depois de `prisma generate`, sem duplicar
 * o schema aqui.
 *
 * Ao adicionar campo novo a uma query, adicione aqui também.
 */

export type CriticalityValue = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type SignalSourceValue = "CSV" | "XLSX" | "GOOGLE_SHEETS" | "ACC" | "MANUAL";
export type ProjectStatusValue = "ACTIVE" | "PAUSED" | "CLOSED";

/** Decimal do Prisma — sempre passar por `toNumber()` antes de usar. */
export type DecimalLike = unknown;
/** Campo Json do Prisma. */
export type JsonLike = unknown;

export interface DRIScoreRow {
  id: string;
  score: number;
  humanScore: number | null;
  systemicScore: number | null;
  breakdown: JsonLike;
  calculatedAt: Date;
}

export interface ProjectListRow {
  id: string;
  name: string;
  client: string | null;
  sector: string | null;
  _count: { milestones: number };
  driScores: { score: number; calculatedAt: Date }[];
}

export interface MilestoneRow {
  id: string;
  name: string;
  type: string | null;
  criticality: CriticalityValue;
  economicImpact: DecimalLike;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
}

export interface MilestoneWithScoreRow extends MilestoneRow {
  driScores: { score: number }[];
  _count: { humanSignals: number; systemicSignals: number };
}

export interface HumanSignalRow {
  id: string;
  respondentRole: string | null;
  failureProbability: number;
  planConfidence: number;
  perceivedBottleneck: string | null;
  blockedDecision: boolean;
  createdAt: Date;
}

export interface SystemicSignalRow {
  id: string;
  source: SignalSourceValue;
  referenceDate: Date;
  plannedDate: Date | null;
  actualDate: Date | null;
  delayDays: number | null;
  plannedCost: DecimalLike;
  actualCost: DecimalLike;
  openIssues: number | null;
  replanCount: number | null;
}

export interface ProjectDetailRow {
  id: string;
  name: string;
  client: string | null;
  sector: string | null;
  currency: string;
  milestones: MilestoneWithScoreRow[];
  driScores: DRIScoreRow[];
}

export interface MilestoneDetailRow extends MilestoneRow {
  project: { id: string; name: string; currency: string };
  driScores: DRIScoreRow[];
  humanSignals: HumanSignalRow[];
  systemicSignals: SystemicSignalRow[];
}

/** Usado pelo serviço de recálculo. */
export interface MilestoneForDRIRow extends MilestoneRow {
  humanSignals: {
    failureProbability: number;
    planConfidence: number;
    blockedDecision: boolean;
    createdAt: Date;
  }[];
  systemicSignals: {
    referenceDate: Date;
    plannedDate: Date | null;
    actualDate: Date | null;
    delayDays: number | null;
    plannedCost: DecimalLike;
    actualCost: DecimalLike;
    openIssues: number | null;
    replanCount: number | null;
  }[];
}

/* ---------------------------------------------------------------------- */
/* View-models das tabelas estilo Ads Manager (/projects, /milestones,    */
/* /signals, /reports). Mesma lógica: mais largo que o client gerado.     */
/* ---------------------------------------------------------------------- */

export interface ProjectMilestoneSummaryRow {
  id: string;
  name: string;
  economicImpact: DecimalLike;
  driScores: { score: number }[];
  _count: { humanSignals: number; systemicSignals: number };
}

export interface ProjectTableRow {
  id: string;
  name: string;
  client: string | null;
  sector: string | null;
  status: ProjectStatusValue;
  currency: string;
  createdAt: Date;
  _count: { milestones: number };
  driScores: { score: number; calculatedAt: Date }[];
  milestones: ProjectMilestoneSummaryRow[];
}

export interface MilestoneTableRow extends MilestoneRow {
  project: { id: string; name: string; currency: string };
  driScores: { score: number }[];
  _count: { humanSignals: number; systemicSignals: number };
}

export interface HumanSignalTableRow extends HumanSignalRow {
  milestone: { id: string; name: string; project: { id: string; name: string } };
}

export interface SystemicSignalTableRow extends SystemicSignalRow {
  milestone: {
    id: string;
    name: string;
    project: { id: string; name: string; currency: string };
  };
}

export interface ProjectDriHistoryRow {
  id: string;
  name: string;
  client: string | null;
  driScores: { score: number; calculatedAt: Date }[];
}

export interface OverviewMilestoneRow extends MilestoneRow {
  project: { id: string; name: string; currency: string; status: ProjectStatusValue };
  driScores: { score: number }[];
  _count: { humanSignals: number; systemicSignals: number };
}

export interface OverviewProjectRow {
  id: string;
  status: ProjectStatusValue;
  driScores: { score: number }[];
}
