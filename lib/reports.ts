/**
 * Modelos dos relatórios em PDF — módulo puro, sem Prisma, Next nem React.
 *
 * O serviço de servidor (lib/server/report-service.ts) lê o banco e entrega
 * estes tipos de entrada; aqui se decide o que cada relatório mostra, em que
 * ordem e com que ressalva. Os componentes de PDF só desenham o resultado.
 * Testado em test/reports.test.mjs.
 *
 * Três níveis, três perguntas:
 *   - Carteira: "onde estão as restrições, entre todos os projetos?"
 *   - Projeto:  "o que está travando este projeto e o que o cliente precisa saber?"
 *   - Pacote:   "o que foi emitido, em que pé está e quanto tempo parou?"
 */

import {
  isTaskOpen,
  isTaskOverdue,
  isPackageType,
  leafTasks,
  projectProgress,
  scheduleHealth,
  slipDays,
  startOfDayUTC,
  taskDueDate,
  type ScheduleHealth,
} from "./tasks";
import { isRequestOverdue } from "./requests";
import { driBand, type DRIBand } from "./dri";
import { daysBetween } from "./documents";
import { groupTopicsByCategory } from "./meetings";

const DAY = 86_400_000;

/* ------------------------------------------------------------------------ */
/* Entradas (formato plano, já sem Decimal/Prisma)                           */
/* ------------------------------------------------------------------------ */

export interface ReportTask {
  id: string;
  name: string;
  kind: string;
  type: string | null;
  criticality: string;
  status: string;
  progress: number;
  parentId: string | null;
  assigneeName: string | null;
  startDate: Date | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
  /** Último score de DRI gravado para esta tarefa (null se nunca calculado). */
  dri: number | null;
}

export interface ReportImpediment {
  id: string;
  taskId: string;
  taskName: string;
  description: string;
  ownerName: string | null;
  waitingOn: string | null;
  createdAt: Date;
}

export interface ReportRequest {
  id: string;
  taskName: string | null;
  type: string | null;
  description: string;
  ownerName: string | null;
  waitingOn: string | null;
  status: string;
  dueAt: Date | null;
  createdAt: Date;
}

export interface ReportRevision {
  id: string;
  documentId: string;
  documentNumber: string | null;
  documentName: string;
  disciplineTag: string | null;
  name: string;
  sequence: number;
  status: string;
  packageId: string | null;
  packageName: string | null;
  specialistName: string | null;
  analysisTag: string | null;
  analysisName: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  analyzedAt: Date | null;
  inReviewSince: Date | null;
}

export interface ReportDriPoint {
  score: number;
  calculatedAt: Date;
}

export interface ReportProjectInput {
  id: string;
  name: string;
  osNumber: string | null;
  status: string;
  clientName: string | null;
  sectorName: string | null;
  designFirmName: string | null;
  managerName: string | null;
  currency: string;
  /** Mais recente primeiro. */
  driScores: ReportDriPoint[];
  tasks: ReportTask[];
  impediments: ReportImpediment[];
  requests: ReportRequest[];
  revisions: ReportRevision[];
}

/* ------------------------------------------------------------------------ */
/* Peças reutilizáveis                                                       */
/* ------------------------------------------------------------------------ */

/** Dias que uma revisão em análise está parada; null se não está em análise. */
export function daysInReview(
  r: Pick<ReportRevision, "status" | "inReviewSince">,
  now: Date,
): number | null {
  if (r.status !== "IN_REVIEW") return null;
  return daysBetween(now, r.inReviewSince);
}

/** Revisão vigente de cada documento = a de maior sequência. */
export function latestRevisions<T extends { documentId: string; sequence: number }>(
  revisions: T[],
): T[] {
  const byDoc = new Map<string, T>();
  for (const r of revisions) {
    const cur = byDoc.get(r.documentId);
    if (!cur || r.sequence > cur.sequence) byDoc.set(r.documentId, r);
  }
  return [...byDoc.values()];
}

/** Variação do DRI contra o snapshot mais próximo de `days` atrás. */
export function driDelta(
  scores: ReportDriPoint[],
  now: Date,
  days = 7,
): { latest: number | null; previous: number | null; delta: number | null } {
  if (scores.length === 0) return { latest: null, previous: null, delta: null };
  const latest = scores[0];
  const target = now.getTime() - days * DAY;
  let previous: ReportDriPoint | null = null;
  let best = Infinity;
  for (const s of scores.slice(1)) {
    const d = Math.abs(s.calculatedAt.getTime() - target);
    if (d < best) {
      best = d;
      previous = s;
    }
  }
  return {
    latest: latest.score,
    previous: previous ? previous.score : null,
    delta: previous ? Math.round((latest.score - previous.score) * 10) / 10 : null,
  };
}

/** Marcos/tarefas que contam para os indicadores: sem cancelada. */
function activeTasks(tasks: ReportTask[]): ReportTask[] {
  return tasks.filter((t) => t.status !== "CANCELLED");
}

/**
 * Restrição dominante: a folha em aberto de maior DRI. Só folhas, como no
 * cálculo do DRI do projeto (lib/server/dri-service.ts).
 */
export function dominantConstraints(tasks: ReportTask[], limit = 3): ReportTask[] {
  const leaves = leafTasks(activeTasks(tasks).map((t) => ({ ...t })));
  return leaves
    .filter((t) => isTaskOpen(t) && t.dri != null)
    .sort((a, b) => (b.dri ?? 0) - (a.dri ?? 0))
    .slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Carteira                                                                  */
/* ------------------------------------------------------------------------ */

export interface PortfolioRow {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
  dri: number | null;
  band: DRIBand | null;
  delta: number | null;
  progress: number | null;
  health: ScheduleHealth;
  overdueTasks: number;
  blockedTasks: number;
  openImpediments: number;
  overdueRequests: number;
  /** Revisões em análise há mais de `STALLED_DAYS` dias. */
  stalledReviews: number;
  dominant: string | null;
}

export interface PortfolioReport {
  generatedAt: Date;
  totals: {
    projects: number;
    active: number;
    critical: number;
    high: number;
    late: number;
    openImpediments: number;
    overdueRequests: number;
    stalledReviews: number;
    averageDri: number | null;
  };
  /** Ordenado do pior para o melhor: quem precisa de atenção vem primeiro. */
  rows: PortfolioRow[];
  /** O que piorou: variação positiva de DRI, maior primeiro. */
  worsened: PortfolioRow[];
}

/** Revisão em análise há mais que isto entra como "parada" (DRI_CONFIG usa 14). */
export const STALLED_DAYS = 14;

export function buildPortfolioReport(
  projects: ReportProjectInput[],
  now: Date,
): PortfolioReport {
  const rows: PortfolioRow[] = projects.map((p) => {
    const tasks = activeTasks(p.tasks);
    const { latest, delta } = driDelta(p.driScores, now);
    const dominant = dominantConstraints(p.tasks, 1)[0]?.name ?? null;
    const stalled = latestRevisions(p.revisions).filter(
      (r) => (daysInReview(r, now) ?? -1) >= STALLED_DAYS,
    ).length;

    return {
      id: p.id,
      name: p.name,
      clientName: p.clientName,
      status: p.status,
      dri: latest,
      band: latest == null ? null : driBand(latest),
      delta,
      progress: projectProgress(tasks),
      health: scheduleHealth(tasks, now),
      overdueTasks: tasks.filter((t) => isTaskOverdue(t, now)).length,
      blockedTasks: tasks.filter((t) => t.status === "BLOCKED").length,
      openImpediments: p.impediments.length,
      overdueRequests: p.requests.filter((r) => isRequestOverdue(r, now)).length,
      stalledReviews: stalled,
      dominant,
    };
  });

  // Ativo primeiro; dentro do grupo, DRI maior primeiro; sem DRI por último.
  rows.sort((a, b) => {
    const s = Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE");
    if (s !== 0) return s;
    return (b.dri ?? -1) - (a.dri ?? -1);
  });

  const scored = rows.filter((r) => r.dri != null && r.status === "ACTIVE");
  return {
    generatedAt: now,
    totals: {
      projects: rows.length,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      critical: rows.filter((r) => r.band === "critical").length,
      high: rows.filter((r) => r.band === "high").length,
      late: rows.filter((r) => r.health === "LATE").length,
      openImpediments: rows.reduce((a, r) => a + r.openImpediments, 0),
      overdueRequests: rows.reduce((a, r) => a + r.overdueRequests, 0),
      stalledReviews: rows.reduce((a, r) => a + r.stalledReviews, 0),
      averageDri:
        scored.length > 0
          ? Math.round((scored.reduce((a, r) => a + (r.dri ?? 0), 0) / scored.length) * 10) / 10
          : null,
    },
    rows,
    worsened: rows
      .filter((r) => (r.delta ?? 0) > 0)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
      .slice(0, 5),
  };
}

/* ------------------------------------------------------------------------ */
/* Projeto                                                                   */
/* ------------------------------------------------------------------------ */

export interface ProjectTaskRow {
  id: string;
  name: string;
  isGroup: boolean;
  isChild: boolean;
  status: string;
  progress: number;
  assigneeName: string | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
  slip: number | null;
  overdue: boolean;
  dri: number | null;
  isPackage: boolean;
}

export interface DocumentSummary {
  totalDocuments: number;
  approved: number;
  inReview: number;
  returned: number; // comentada/reprovada, aguardando nova revisão do emissor
  draft: number;
  cancelled: number;
  /** Aprovados / (total - cancelados), em %. */
  approvedPct: number | null;
  stalled: number;
  averageRevisions: number | null;
  byDiscipline: { tag: string; total: number; approved: number; open: number }[];
}

export interface PackageRow {
  id: string;
  name: string;
  parentName: string | null;
  status: string;
  progress: number;
  dueDate: Date | null;
  revisions: number;
  overdue: boolean;
}

export interface ProjectReport {
  generatedAt: Date;
  project: {
    name: string;
    osNumber: string | null;
    status: string;
    clientName: string | null;
    sectorName: string | null;
    designFirmName: string | null;
    managerName: string | null;
  };
  dri: {
    latest: number | null;
    band: DRIBand | null;
    delta: number | null;
    /** Cronológico (antigo → recente), até 30 pontos, para o gráfico. */
    trend: ReportDriPoint[];
  };
  progress: number | null;
  health: ScheduleHealth;
  counts: {
    tasks: number;
    done: number;
    overdue: number;
    blocked: number;
    openImpediments: number;
    pendingRequests: number;
    overdueRequests: number;
  };
  constraints: ReportTask[];
  tasks: ProjectTaskRow[];
  impediments: (ReportImpediment & { daysOpen: number })[];
  requests: (ReportRequest & { overdue: boolean; daysOpen: number })[];
  documents: DocumentSummary;
  packages: PackageRow[];
  /** Revisões em análise, da mais parada para a menos. */
  reviewQueue: (ReportRevision & { days: number | null })[];
}

export function summarizeDocuments(
  revisions: ReportRevision[],
  now: Date,
): DocumentSummary {
  const latest = latestRevisions(revisions);
  const counted = latest.filter((r) => r.status !== "CANCELLED");

  const approved = counted.filter((r) => r.status === "APPROVED").length;
  const byDisc = new Map<string, { total: number; approved: number }>();
  for (const r of counted) {
    const tag = r.disciplineTag ?? "Sem disciplina";
    const cur = byDisc.get(tag) ?? { total: 0, approved: 0 };
    cur.total += 1;
    if (r.status === "APPROVED") cur.approved += 1;
    byDisc.set(tag, cur);
  }

  const revCount = new Map<string, number>();
  for (const r of revisions) revCount.set(r.documentId, (revCount.get(r.documentId) ?? 0) + 1);

  return {
    totalDocuments: latest.length,
    approved,
    inReview: latest.filter((r) => r.status === "IN_REVIEW").length,
    returned: latest.filter((r) => r.status === "COMMENTED" || r.status === "REJECTED").length,
    draft: latest.filter((r) => r.status === "DRAFT").length,
    cancelled: latest.length - counted.length,
    approvedPct: counted.length > 0 ? Math.round((approved / counted.length) * 100) : null,
    stalled: latest.filter((r) => (daysInReview(r, now) ?? -1) >= STALLED_DAYS).length,
    averageRevisions:
      revCount.size > 0
        ? Math.round(([...revCount.values()].reduce((a, b) => a + b, 0) / revCount.size) * 10) / 10
        : null,
    byDiscipline: [...byDisc.entries()]
      .map(([tag, v]) => ({ tag, total: v.total, approved: v.approved, open: v.total - v.approved }))
      .sort((a, b) => b.open - a.open || a.tag.localeCompare(b.tag, "pt-BR")),
  };
}

/** Ordena a árvore: marco, suas filhas (por prazo), e depois as sem pai. */
export function orderTaskRows(tasks: ReportTask[], now: Date): ProjectTaskRow[] {
  const byDue = (a: ReportTask, b: ReportTask) =>
    (taskDueDate(a)?.getTime() ?? Infinity) - (taskDueDate(b)?.getTime() ?? Infinity);

  const parentIds = new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[]);
  const roots = tasks.filter((t) => !t.parentId || !tasks.some((p) => p.id === t.parentId));
  roots.sort(byDue);

  const toRow = (t: ReportTask, isChild: boolean): ProjectTaskRow => ({
    id: t.id,
    name: t.name,
    isGroup: parentIds.has(t.id),
    isChild,
    status: t.status,
    progress: t.status === "DONE" ? 100 : t.progress,
    assigneeName: t.assigneeName,
    plannedDate: t.plannedDate,
    forecastDate: t.forecastDate,
    actualDate: t.actualDate,
    slip: slipDays(t),
    overdue: isTaskOverdue(t, now),
    dri: t.dri,
    isPackage: isPackageType(t.type),
  });

  const out: ProjectTaskRow[] = [];
  for (const r of roots) {
    out.push(toRow(r, false));
    tasks
      .filter((c) => c.parentId === r.id)
      .sort(byDue)
      .forEach((c) => out.push(toRow(c, true)));
  }
  return out;
}

export function buildProjectReport(p: ReportProjectInput, now: Date): ProjectReport {
  const tasks = activeTasks(p.tasks);
  const { latest, delta } = driDelta(p.driScores, now);

  const impediments = p.impediments
    .map((i) => ({ ...i, daysOpen: daysBetween(now, i.createdAt) ?? 0 }))
    .sort((a, b) => b.daysOpen - a.daysOpen);

  const pending = p.requests.filter((r) => r.status === "PENDING");
  const requests = pending
    .map((r) => ({
      ...r,
      overdue: isRequestOverdue(r, now),
      daysOpen: daysBetween(now, r.createdAt) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity),
    );

  // Pacotes: tarefas do tipo pacote; revisões contadas por milestone.
  const revByPackage = new Map<string, number>();
  for (const r of p.revisions) {
    if (r.packageId) revByPackage.set(r.packageId, (revByPackage.get(r.packageId) ?? 0) + 1);
  }
  const nameById = new Map(p.tasks.map((t) => [t.id, t.name]));
  const packages: PackageRow[] = p.tasks
    .filter((t) => isPackageType(t.type) && t.status !== "CANCELLED")
    .map((t) => ({
      id: t.id,
      name: t.name,
      parentName: t.parentId ? (nameById.get(t.parentId) ?? null) : null,
      status: t.status,
      progress: t.status === "DONE" ? 100 : t.progress,
      dueDate: taskDueDate(t),
      revisions: revByPackage.get(t.id) ?? 0,
      overdue: isTaskOverdue(t, now),
    }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity),
    );

  const reviewQueue = latestRevisions(p.revisions)
    .filter((r) => r.status === "IN_REVIEW")
    .map((r) => ({ ...r, days: daysInReview(r, now) }))
    .sort((a, b) => (b.days ?? -1) - (a.days ?? -1));

  return {
    generatedAt: now,
    project: {
      name: p.name,
      osNumber: p.osNumber,
      status: p.status,
      clientName: p.clientName,
      sectorName: p.sectorName,
      designFirmName: p.designFirmName,
      managerName: p.managerName,
    },
    dri: {
      latest,
      band: latest == null ? null : driBand(latest),
      delta,
      trend: [...p.driScores].slice(0, 30).reverse(),
    },
    progress: projectProgress(tasks),
    health: scheduleHealth(tasks, now),
    counts: {
      tasks: tasks.length,
      done: tasks.filter((t) => t.status === "DONE").length,
      overdue: tasks.filter((t) => isTaskOverdue(t, now)).length,
      blocked: tasks.filter((t) => t.status === "BLOCKED").length,
      openImpediments: impediments.length,
      pendingRequests: pending.length,
      overdueRequests: requests.filter((r) => r.overdue).length,
    },
    constraints: dominantConstraints(p.tasks, 3),
    tasks: orderTaskRows(tasks, now),
    impediments,
    requests,
    documents: summarizeDocuments(p.revisions, now),
    packages,
    reviewQueue,
  };
}

/* ------------------------------------------------------------------------ */
/* Pacote de revisão                                                         */
/* ------------------------------------------------------------------------ */

export interface ReportTransition {
  id: string;
  revisionName: string;
  documentNumber: string | null;
  documentName: string;
  action: string;
  actorName: string | null;
  assignedToName: string | null;
  analysisTag: string | null;
  comment: string | null;
  daysInPreviousStage: number | null;
  createdAt: Date;
}

export interface ReportDeadlineChange {
  fromDate: Date | null;
  toDate: Date;
  reason: string | null;
  createdAt: Date;
}

export interface ReportPackageInput {
  projectName: string;
  projectOsNumber: string | null;
  clientName: string | null;
  designFirmName: string | null;
  id: string;
  name: string;
  parentName: string | null;
  status: string;
  progress: number;
  assigneeName: string | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
  revisions: ReportRevision[];
  transitions: ReportTransition[];
  impediments: ReportImpediment[];
  requests: ReportRequest[];
  deadlineChanges: ReportDeadlineChange[];
}

export interface PackageReport {
  generatedAt: Date;
  header: Omit<
    ReportPackageInput,
    "revisions" | "transitions" | "impediments" | "requests" | "deadlineChanges"
  > & { slip: number | null; overdue: boolean };
  counts: {
    total: number;
    approved: number;
    inReview: number;
    returned: number;
    draft: number;
    cancelled: number;
    /** Com parecer final / (total - cancelados), em %. */
    finalPct: number | null;
    longestReviewDays: number | null;
    averageReviewDays: number | null;
  };
  revisions: (ReportRevision & { days: number | null; overdue: boolean })[];
  transitions: ReportTransition[];
  impediments: (ReportImpediment & { daysOpen: number })[];
  requests: (ReportRequest & { overdue: boolean })[];
  deadlineChanges: ReportDeadlineChange[];
}

/** Parecer final = revisão que saiu da fila (aprovada, devolvida, substituída). */
const FINAL_STATUSES = new Set(["APPROVED", "COMMENTED", "REJECTED", "SUPERSEDED"]);

export function buildPackageReport(p: ReportPackageInput, now: Date): PackageReport {
  const revisions = [...p.revisions]
    .map((r) => ({
      ...r,
      days: daysInReview(r, now),
      overdue:
        !!r.dueAt &&
        (r.status === "DRAFT" || r.status === "IN_REVIEW") &&
        startOfDayUTC(r.dueAt).getTime() < startOfDayUTC(now).getTime(),
    }))
    .sort(
      (a, b) =>
        (a.documentNumber ?? a.documentName).localeCompare(b.documentNumber ?? b.documentName, "pt-BR", {
          numeric: true,
        }) || a.sequence - b.sequence,
    );

  const counted = revisions.filter((r) => r.status !== "CANCELLED");
  const inReviewDays = revisions.map((r) => r.days).filter((d): d is number => d != null);

  const transitions = [...p.transitions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const dueDate = taskDueDate(p);
  const isOpen = isTaskOpen(p);

  return {
    generatedAt: now,
    header: {
      projectName: p.projectName,
      projectOsNumber: p.projectOsNumber,
      clientName: p.clientName,
      designFirmName: p.designFirmName,
      id: p.id,
      name: p.name,
      parentName: p.parentName,
      status: p.status,
      progress: p.status === "DONE" ? 100 : p.progress,
      assigneeName: p.assigneeName,
      plannedDate: p.plannedDate,
      forecastDate: p.forecastDate,
      actualDate: p.actualDate,
      slip: slipDays(p),
      overdue:
        isOpen &&
        !!dueDate &&
        startOfDayUTC(dueDate).getTime() < startOfDayUTC(now).getTime(),
    },
    counts: {
      total: revisions.length,
      approved: revisions.filter((r) => r.status === "APPROVED").length,
      inReview: revisions.filter((r) => r.status === "IN_REVIEW").length,
      returned: revisions.filter((r) => r.status === "COMMENTED" || r.status === "REJECTED").length,
      draft: revisions.filter((r) => r.status === "DRAFT").length,
      cancelled: revisions.length - counted.length,
      finalPct:
        counted.length > 0
          ? Math.round((counted.filter((r) => FINAL_STATUSES.has(r.status)).length / counted.length) * 100)
          : null,
      longestReviewDays: inReviewDays.length ? Math.max(...inReviewDays) : null,
      averageReviewDays: inReviewDays.length
        ? Math.round(inReviewDays.reduce((a, b) => a + b, 0) / inReviewDays.length)
        : null,
    },
    revisions,
    transitions,
    impediments: p.impediments
      .map((i) => ({ ...i, daysOpen: daysBetween(now, i.createdAt) ?? 0 }))
      .sort((a, b) => b.daysOpen - a.daysOpen),
    requests: p.requests
      .filter((r) => r.status === "PENDING")
      .map((r) => ({ ...r, overdue: isRequestOverdue(r, now) })),
    deadlineChanges: [...p.deadlineChanges].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    ),
  };
}


/* ------------------------------------------------------------------------ */
/* Relatório de reunião (ata)                                                */
/* ------------------------------------------------------------------------ */

export interface ReportMeetingParticipant {
  name: string;
  company: string | null;
  email: string | null;
  mode: string | null;
}

export interface ReportMeetingTopic {
  category: string | null;
  date: Date | null;
  description: string;
  responsible: string | null;
  dueDate: Date | null;
  status: string;
}

export interface ReportMeetingInput {
  id: string;
  projectName: string;
  projectOsNumber: string | null;
  clientName: string | null;
  /** Rótulo fixo do rodapé no padrão do cliente (código do formulário,
   * validade, classificação). Null = só o modelo DataPulse é oferecido. */
  meetingFormCode: string | null;
  designFirmName: string | null;
  parentName: string | null;
  date: Date;
  title: string | null;
  location: string | null;
  startTime: string | null;
  preparedBy: string | null;
  number: number | null;
  subject: string | null;
  diverseSubjects: string | null;
  summary: string | null;
  participants: ReportMeetingParticipant[];
  topics: ReportMeetingTopic[];
  requests: ReportRequest[];
}

export interface MeetingReport {
  generatedAt: Date;
  header: Omit<ReportMeetingInput, "participants" | "topics" | "requests">;
  participants: ReportMeetingParticipant[];
  /** Tópicos agrupados pela ordem fixa do formulário do cliente — só os
   * grupos com conteúdo aparecem no relatório DataPulse; o modelo do
   * cliente lista os 5 fixos mesmo vazios (ver meeting-report-client). */
  topicGroups: { category: string; items: ReportMeetingTopic[] }[];
  requests: (ReportRequest & { overdue: boolean })[];
}

export function buildMeetingReport(m: ReportMeetingInput, now: Date): MeetingReport {
  const { participants, topics, requests, ...header } = m;
  return {
    generatedAt: now,
    header,
    participants,
    topicGroups: groupTopicsByCategory(topics).filter((g) => g.items.length > 0),
    requests: requests.map((r) => ({ ...r, overdue: isRequestOverdue(r, now) })),
  };
}

