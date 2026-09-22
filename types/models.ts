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
  clientRef: { id: string; name: string } | null;
  sector: { id: string; name: string } | null;
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

export interface ProjectMemberRow {
  id: string;
  roleInProject: string | null;
  user: {
    id: string;
    name: string;
    function: { name: string } | null;
    role: RoleValue;
  };
}

export type TaskKindValue = "TASK" | "MILESTONE";
export type TaskStatusValue = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE"
  | "CANCELLED";

/** Campos de tarefa acrescentados ao antigo "marco". */
export interface TaskFieldsRow {
  kind: TaskKindValue;
  status: TaskStatusValue;
  progress: number;
  startDate: Date | null;
  parentId: string | null;
  assignee: { id: string; name: string } | null;
}

export interface ProjectTaskRow extends MilestoneWithScoreRow, TaskFieldsRow {
  _count: { humanSignals: number; systemicSignals: number; impediments: number; requests: number };
  /** Montado na página (agrupamento por parentId), não vem direto do Prisma. */
  children?: ProjectTaskRow[];
}

export interface ImpedimentRow {
  id: string;
  description: string;
  waitingOn: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  owner: { id: string; name: string } | null;
}

export interface ProjectDetailRow {
  id: string;
  name: string;
  status: ProjectStatusValue;
  osNumber: string | null;
  clientRef: { id: string; name: string } | null;
  sector: { id: string; name: string } | null;
  designFirm: { id: string; name: string } | null;
  currency: string;
  milestones: ProjectTaskRow[];
  requests: RequestRow[];
  driScores: DRIScoreRow[];
  manager: { id: string; name: string; function: { name: string } | null } | null;
  members: ProjectMemberRow[];
  _count: { documents: number; files: number };
}

export interface MilestoneDetailRow extends MilestoneRow, TaskFieldsRow {
  project: { id: string; name: string; currency: string; status: ProjectStatusValue };
  /** Marco ao qual esta tarefa pertence, quando houver. */
  parent: { id: string; name: string } | null;
  /** Tarefas filhas, quando este registro é um marco que agrupa. */
  children: ProjectTaskRow[];
  impediments: ImpedimentRow[];
  requests: RequestRow[];
  deadlineChanges: DeadlineChangeRow[];
  driScores: DRIScoreRow[];
  humanSignals: HumanSignalRow[];
  systemicSignals: SystemicSignalRow[];
}

/* ---------------------------------------------------------------------- */
/* Solicitações e histórico de reprogramação                               */
/* ---------------------------------------------------------------------- */

export type RequestStatusValue = "PENDING" | "ANSWERED" | "DISMISSED" | "EXPIRED";

export interface RequestDocumentLinkRow {
  id: string;
  document: { id: string; number: string | null; name: string };
}

export interface RequestRow {
  id: string;
  type: string | null;
  description: string;
  status: RequestStatusValue;
  waitingOn: string | null;
  dueAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  owner: { id: string; name: string } | null;
  milestone: { id: string; name: string } | null;
  documents: RequestDocumentLinkRow[];
}

/** Solicitação aberta em tela própria: com projeto, prazo original e histórico. */
export interface RequestDetailRow extends RequestRow {
  project: { id: string; name: string; status: ProjectStatusValue };
  deadlineChanges: DeadlineChangeRow[];
}

export interface DeadlineChangeRow {
  id: string;
  fromDate: Date | null;
  toDate: Date;
  reason: string | null;
  createdAt: Date;
}

/** Solicitação como o Painel lê: com projeto e tarefa/marco relacionados. */
export interface DashboardRequestRow {
  id: string;
  status: RequestStatusValue;
  description: string;
  type: string | null;
  waitingOn: string | null;
  dueAt: Date | null;
  createdAt: Date;
  owner: { name: string } | null;
  project: { id: string; name: string };
  milestone: { id: string; name: string } | null;
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
  osNumber: string | null;
  clientRef: { id: string; name: string } | null;
  sector: { id: string; name: string } | null;
  designFirm: { id: string; name: string } | null;
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
  clientRef: { id: string; name: string } | null;
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

/** Tarefa como o Painel lê: com projeto, responsável e impedimentos abertos. */
export interface DashboardTaskRow extends MilestoneRow, TaskFieldsRow {
  project: { id: string; name: string; sectorId: string | null };
  driScores: { score: number }[];
  _count: { impediments: number };
}

export interface DashboardProjectRow {
  id: string;
  name: string;
  status: ProjectStatusValue;
  cost: DecimalLike;
  currency: string;
  startsAt: Date | null;
  endsAt: Date | null;
  clientRef: { name: string } | null;
  sector: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  driScores: { score: number }[];
}

export interface DashboardImpedimentRow {
  id: string;
  description: string;
  waitingOn: string | null;
  createdAt: Date;
  owner: { name: string } | null;
  milestone: { id: string; name: string; project: { id: string; name: string } };
}

export interface MyTaskRow extends MilestoneRow, TaskFieldsRow {
  project: { id: string; name: string };
  driScores: { score: number }[];
}

/* ---------------------------------------------------------------------- */
/* Integração com o Autodesk Construction Cloud                            */
/* ---------------------------------------------------------------------- */

export type AccSyncStatusValue = "NEVER_RUN" | "OK" | "FAILED" | "REAUTH_REQUIRED";

export interface AccConnectionViewRow {
  id: string;
  hubId: string;
  hubName: string | null;
  refreshTokenExpiresAt: Date;
  dataRequestId: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: AccSyncStatusValue;
  lastSyncError: string | null;
  createdAt: Date;
  projects: {
    id: string;
    name: string;
    accProjectId: string | null;
    accProjectName: string | null;
  }[];
}

export interface UnlinkedProjectRow {
  id: string;
  name: string;
  clientRef: { id: string; name: string } | null;
}

/* ---------------------------------------------------------------------- */
/* Pessoas, documentos e demandas                                          */
/* ---------------------------------------------------------------------- */

export type RoleValue = "ADMIN" | "MANAGER" | "SPECIALIST" | "EXECUTIVE";
export type DocumentStatusValue =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "COMMENTED"
  | "REJECTED"
  | "SUPERSEDED"
  | "CANCELLED";
export type DocumentActionValue =
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
export type SignalRequestStatusValue = "PENDING" | "ANSWERED" | "DISMISSED" | "EXPIRED";

export interface UserTableRow {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  function: { id: string; name: string } | null;
  company: { id: string; name: string } | null;
  /** Disciplinas que o usuário domina (só os ids; o nome vem do cadastro). */
  disciplines: { disciplineId: string }[];
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  _count: { memberships: number; managedProjects: number; signalRequests: number };
}

export interface UserOption {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  function: { name: string } | null;
}

export interface AnalysisCodeRow {
  id: string;
  tag: string;
  name: string;
  effect: AnalysisEffectValue;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export type AnalysisEffectValue =
  | "APPROVES"
  | "APPROVES_WITH_COMMENTS"
  | "COMMENTS"
  | "REJECTS"
  | "CANCELS";

export interface ReferenceRow {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ClientRow extends ReferenceRow {
  code: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  _count: { projects: number };
}

export interface DisciplineRow extends ReferenceRow {
  tag: string;
  _count: { documents: number };
}

export interface RoleProfileRow {
  role: RoleValue;
  label: string;
  description: string | null;
}

export interface EmpresaRow extends ReferenceRow {
  coordinatorName: string | null;
  email: string | null;
  phone: string | null;
  _count: { projects: number; documents: number };
}

export interface SectorRow extends ReferenceRow {
  _count: { projects: number };
}

export interface JobFunctionRow extends ReferenceRow {
  _count: { users: number };
}

/** Projeto reduzido ao necessário para preencher um seletor. */
export interface ProjectOption {
  id: string;
  name: string;
  osNumber: string | null;
}

/** Revisão resumida, como aparece na lista do documento. */
export interface RevisionRow {
  id: string;
  name: string;
  sequence: number;
  status: DocumentStatusValue;
  round: number;
  inReviewSince: Date | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  analyzedAt: Date | null;
  externalUrl: string | null;
  notes: string | null;
  specialist: { id: string; name: string } | null;
  analysisCode: { id: string; tag: string; name: string } | null;
  /** Pacote de revisão (Tarefa) em que foi emitida. Nulo só no legado sem backfill. */
  milestone: { id: string; name: string; parent: { name: string } | null } | null;
  _count: { transitions: number };
}

/** Pacote de revisão escolhível ao emitir um documento/revisão. */
export interface PackageOption {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  marcoId: string;
  marcoName: string;
}

/** Marco onde um pacote novo pode ser criado. */
export interface MarcoOption {
  id: string;
  name: string;
}

/** Linha da lista de pacotes de revisão do projeto (gestão: editar/excluir). */
export interface PackageListRow {
  id: string;
  name: string;
  status: TaskStatusValue;
  progress: number;
  plannedDate: Date | null;
  forecastDate: Date | null;
  createdAt: Date;
  marco: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  _count: { documentRevisions: number };
}

export interface DocumentTableRow {
  id: string;
  number: string | null;
  name: string;
  type: string | null;
  discipline: { id: string; tag: string; name: string } | null;
  designFirm: { id: string; name: string } | null;
  responsible: { id: string; name: string } | null;
  project: { id: string; name: string };
  revisions: RevisionRow[];
}

export interface DocumentTransitionRow {
  id: string;
  action: DocumentActionValue;
  fromStatus: DocumentStatusValue | null;
  toStatus: DocumentStatusValue;
  analysisCodeTag: string | null;
  round: number;
  actorName: string | null;
  assignedToName: string | null;
  comment: string | null;
  dueAt: Date | null;
  daysInPreviousStage: number | null;
  createdAt: Date;
  revision: { id: string; name: string };
}

export interface DocumentDetailRow extends DocumentTableRow {
  /// `organizationId` vem junto porque a página do documento usa ele para
  /// barrar acesso a documento de outra organização (Document não tem
  /// organizationId próprio — herda via projeto).
  project: { id: string; name: string; status: ProjectStatusValue; organizationId: string };
  notes: string | null;
  createdAt: Date;
  /// Ids dos vínculos, para preencher o formulário de edição dos dados.
  disciplineId: string | null;
  designFirmId: string | null;
  responsibleId: string | null;
}

export interface SignalRequestRow {
  id: string;
  status: SignalRequestStatusValue;
  dueAt: Date | null;
  note: string | null;
  createdAt: Date;
  answeredAt: Date | null;
  milestone: {
    id: string;
    name: string;
    criticality: CriticalityValue;
    plannedDate: Date | null;
    project: { id: string; name: string };
    driScores: { score: number }[];
  };
}

export interface MilestoneRequestRow {
  id: string;
  status: SignalRequestStatusValue;
  dueAt: Date | null;
  createdAt: Date;
  answeredAt: Date | null;
  assignee: { id: string; name: string; function: { name: string } | null };
}
