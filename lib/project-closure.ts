/**
 * Encerramento do projeto — puro, sem Prisma nem Next (testado em
 * test/project-closure.test.mjs).
 *
 * Segue o processo "Encerrar o Projeto ou Fase" do PMBOK, adaptado ao
 * DataPulse:
 *
 * 1. **Verificar pendências** (`closureChecklist`): entregas sem aceite final,
 *    tarefas, solicitações, impedimentos, pendências de reunião e o que falta
 *    medir/aprovar no BM. Nada aqui bloqueia: encerrar com pendência é
 *    permitido, mas exige justificativa e a lista fica fotografada no termo.
 * 2. **Fechar os números** (`closureMetrics`): planejado × real de prazo,
 *    entregas, retrabalho e medição — o "relatório final".
 * 3. **Registrar o termo** (`validateClosure`): tipo (concluído ou
 *    interrompido), data efetiva, evidência do aceite, resumo e lições
 *    aprendidas.
 * 4. **Reabrir** (`validateReopen`) só com justificativa; o termo anterior
 *    continua no histórico.
 */

import { isTaskOpen, leafTasks, type ProjectStatus, type TaskDates } from "./tasks";
import { isTopicClosed } from "./meetings";

export type ClosureType = "COMPLETED" | "INTERRUPTED";

export const CLOSURE_TYPE_LABEL: Record<ClosureType, string> = {
  COMPLETED: "Concluído",
  INTERRUPTED: "Interrompido",
};

export const CLOSURE_TYPE_HINT: Record<ClosureType, string> = {
  COMPLETED: "Escopo entregue e aceito pelo contratante.",
  INTERRUPTED: "Encerrado antes do fim: cancelamento, escopo suspenso ou transferido.",
};

/** Encerrar vale para projeto ativo ou pausado. */
export function canCloseProject(status: ProjectStatus | string): boolean {
  return status === "ACTIVE" || status === "PAUSED";
}

/** Só projeto encerrado é reaberto (pausado volta pela chave em Projetos). */
export function canReopenProject(status: ProjectStatus | string): boolean {
  return status === "CLOSED";
}

/** Rótulo de uma linha do histórico de status. */
export function statusChangeLabel(from: ProjectStatus | string, to: ProjectStatus | string): string {
  if (to === "CLOSED") return "Encerrado";
  if (from === "CLOSED") return "Reaberto";
  if (to === "PAUSED") return "Pausado";
  if (to === "ACTIVE") return "Reativado";
  return `${from} → ${to}`;
}

/* ---------------------------------------------------------------------- */
/* Entradas                                                               */
/* ---------------------------------------------------------------------- */

export interface ClosureTask extends TaskDates {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface ClosureDocument {
  id: string;
  number: string | null;
  name: string;
  /** Revisões em ordem de `sequence` (a última é a vigente). */
  revisions: { name: string; status: string }[];
}

export interface ClosureRequest {
  id: string;
  title: string;
  status: string;
}

export interface ClosureImpediment {
  id: string;
  description: string;
  taskId: string;
  taskName: string;
}

export interface ClosureTopic {
  id: string;
  /** Origem do item quando ele veio de uma ata anterior. */
  sourceTopicId: string | null;
  description: string;
  status: string;
  meetingId: string;
  meetingDate: Date;
}

export interface ClosureRevisionToMeasure {
  documentId: string;
  documentNumber: string | null;
  documentName: string;
  revisionName: string;
  remainingPercent: number;
  value: number;
}

export interface ClosureMeasurementLine {
  measurementId: string;
  code: string;
  status: string;
  amount: number;
}

export interface ClosureInput {
  projectId: string;
  tasks: ClosureTask[];
  documents: ClosureDocument[];
  requests: ClosureRequest[];
  impediments: ClosureImpediment[];
  topics: ClosureTopic[];
  /** Revisões medíveis do projeto com saldo (já filtradas por `measurable`). */
  toMeasure: ClosureRevisionToMeasure[];
  /** Linhas de BM do projeto (qualquer status). */
  measurementLines: ClosureMeasurementLine[];
}

/* ---------------------------------------------------------------------- */
/* Checklist de pendências                                                */
/* ---------------------------------------------------------------------- */

export type ClosureCheckKey =
  | "deliverables"
  | "tasks"
  | "requests"
  | "impediments"
  | "meetingTopics"
  | "toMeasure"
  | "measurements";

export interface ClosureCheckItem {
  key: ClosureCheckKey;
  label: string;
  /** Por que importa (texto curto para a tela). */
  hint: string;
  count: number;
  /** Até `DETAIL_LIMIT` exemplos, para a pessoa ir direto ao item. */
  details: { label: string; href?: string }[];
}

export interface ClosureChecklist {
  items: ClosureCheckItem[];
  /** Soma das pendências de todos os itens. */
  pendingCount: number;
}

export const DETAIL_LIMIT = 8;

/** Desfecho final de um documento: aprovado ou cancelado. */
export const FINAL_DOCUMENT_STATUSES = new Set(["APPROVED", "CANCELLED"]);

/** Revisão vigente = a última da lista (já ordenada por `sequence`). */
export function currentRevision(doc: ClosureDocument): { name: string; status: string } | null {
  return doc.revisions.length ? doc.revisions[doc.revisions.length - 1] : null;
}

/** Documento ainda sem aceite final (inclui o cadastrado e nunca emitido). */
export function isDocumentPending(doc: ClosureDocument): boolean {
  const cur = currentRevision(doc);
  return !cur || !FINAL_DOCUMENT_STATUSES.has(cur.status);
}

const DOC_STATUS_SHORT: Record<string, string> = {
  DRAFT: "emitida/em produção",
  IN_REVIEW: "em análise",
  COMMENTED: "comentada, falta nova revisão",
  REJECTED: "reprovada, falta nova revisão",
  SUPERSEDED: "substituída",
};

function docLabel(d: { number: string | null; name: string }): string {
  return d.number ? `${d.number} — ${d.name}` : d.name;
}

/**
 * Pendência de reunião = item da última ata em que ele aparece, sem status de
 * encerrado e que não seja só informativo. Itens levados para a ata seguinte
 * compartilham a origem (`sourceTopicId`): vale a cópia mais recente.
 */
export function openMeetingTopics(topics: ClosureTopic[]): ClosureTopic[] {
  const latest = new Map<string, ClosureTopic>();
  for (const t of topics) {
    const key = t.sourceTopicId ?? t.id;
    const prev = latest.get(key);
    if (!prev || t.meetingDate.getTime() >= prev.meetingDate.getTime()) latest.set(key, t);
  }
  return [...latest.values()].filter((t) => {
    const s = t.status.trim().toUpperCase();
    return s !== "INFORMATIVO" && s !== "" && !isTopicClosed(s);
  });
}

/** Linhas de BM em rascunho ou enviado (ainda não aprovado), agrupadas por BM. */
export function openMeasurements(lines: ClosureMeasurementLine[]): { id: string; code: string; status: string; amount: number }[] {
  const byId = new Map<string, { id: string; code: string; status: string; amount: number }>();
  for (const l of lines) {
    if (l.status !== "DRAFT" && l.status !== "SENT") continue;
    const prev = byId.get(l.measurementId);
    if (prev) prev.amount = round2(prev.amount + l.amount);
    else byId.set(l.measurementId, { id: l.measurementId, code: l.code, status: l.status, amount: round2(l.amount) });
  }
  return [...byId.values()];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function closureChecklist(input: ClosureInput): ClosureChecklist {
  const pid = input.projectId;
  const items: ClosureCheckItem[] = [];

  const docs = input.documents.filter(isDocumentPending);
  items.push({
    key: "deliverables",
    label: "Documentos sem aceite final",
    hint: "O aceite das entregas vem antes do encerramento. Aprovado ou cancelado conta como final.",
    count: docs.length,
    details: docs.slice(0, DETAIL_LIMIT).map((d) => {
      const cur = currentRevision(d);
      const state = cur ? `${cur.name}: ${DOC_STATUS_SHORT[cur.status] ?? cur.status}` : "sem revisão";
      return { label: `${docLabel(d)} (${state})`, href: `/projects/${pid}/documents?doc=${d.id}` };
    }),
  });

  const tasks = leafTasks(input.tasks).filter(isTaskOpen);
  items.push({
    key: "tasks",
    label: "Tarefas em aberto",
    hint: "Conclua ou cancele o que não será feito.",
    count: tasks.length,
    details: tasks.slice(0, DETAIL_LIMIT).map((t) => ({ label: t.name, href: `/projects/${pid}?task=${t.id}` })),
  });

  const requests = input.requests.filter((r) => r.status === "PENDING");
  items.push({
    key: "requests",
    label: "Solicitações pendentes",
    hint: "Responda ou cancele as solicitações em aberto.",
    count: requests.length,
    details: requests.slice(0, DETAIL_LIMIT).map((r) => ({ label: r.title, href: `/projects/${pid}?request=${r.id}` })),
  });

  items.push({
    key: "impediments",
    label: "Impedimentos abertos",
    hint: "Resolva ou registre o desfecho dos bloqueios.",
    count: input.impediments.length,
    details: input.impediments
      .slice(0, DETAIL_LIMIT)
      .map((i) => ({ label: `${i.taskName}: ${i.description}`, href: `/projects/${pid}?task=${i.taskId}` })),
  });

  const topics = openMeetingTopics(input.topics);
  items.push({
    key: "meetingTopics",
    label: "Pendências de reunião",
    hint: "Itens da última ata sem status Concluído ou Cancelado.",
    count: topics.length,
    details: topics
      .slice(0, DETAIL_LIMIT)
      .map((t) => ({ label: t.description, href: `/projects/${pid}/meetings/${t.meetingId}` })),
  });

  const toMeasure = input.toMeasure.filter((r) => r.remainingPercent > 0);
  items.push({
    key: "toMeasure",
    label: "Revisões com saldo a medir",
    hint: "Entregue e ainda não medido no BM. Encerrar não impede medir depois.",
    count: toMeasure.length,
    details: toMeasure.slice(0, DETAIL_LIMIT).map((r) => ({
      label: `${docLabel({ number: r.documentNumber, name: r.documentName })} ${r.revisionName} (${r.remainingPercent}% a medir)`,
      href: `/projects/${pid}/documents?doc=${r.documentId}`,
    })),
  });

  const bms = openMeasurements(input.measurementLines);
  items.push({
    key: "measurements",
    label: "BMs não aprovados",
    hint: "Boletins com itens deste projeto ainda em rascunho ou enviados.",
    count: bms.length,
    details: bms.slice(0, DETAIL_LIMIT).map((m) => ({
      label: `${m.code} (${m.status === "DRAFT" ? "rascunho" : "enviado"})`,
      href: `/measurements/${m.id}`,
    })),
  });

  return { items, pendingCount: items.reduce((a, i) => a + i.count, 0) };
}

/** Versão para guardar no termo: só contagem e rótulos, sem links. */
export function checklistSnapshot(c: ClosureChecklist): { key: string; label: string; count: number; details: string[] }[] {
  return c.items
    .filter((i) => i.count > 0)
    .map((i) => ({ key: i.key, label: i.label, count: i.count, details: i.details.map((d) => d.label) }));
}

/* ---------------------------------------------------------------------- */
/* Indicadores finais                                                     */
/* ---------------------------------------------------------------------- */

export interface ClosureMetrics {
  plannedStart: string | null;
  plannedEnd: string | null;
  closedOn: string | null;
  /** Dias entre o término previsto do projeto e o encerramento (+ = depois). */
  scheduleVarianceDays: number | null;
  tasksTotal: number;
  tasksDone: number;
  documentsTotal: number;
  documentsApproved: number;
  documentsCancelled: number;
  documentsPending: number;
  /** Revisões emitidas (sem contar as canceladas). */
  revisionsIssued: number;
  /** Revisões comentadas ou reprovadas — exigiram nova revisão. */
  reworkRevisions: number;
  /** % dos documentos aprovados sem nenhuma revisão comentada/reprovada. */
  firstPassApprovalPct: number | null;
  contractedCost: number | null;
  measuredApproved: number;
  measuredPending: number;
  valueToMeasure: number;
}

const DAY = 86_400_000;

function day(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function closureMetrics(
  input: ClosureInput,
  opts: { startsAt: Date | null; endsAt: Date | null; closedOn: Date | null; cost: number | null },
): ClosureMetrics {
  const leaves = leafTasks(input.tasks).filter((t) => t.status !== "CANCELLED");
  const docs = input.documents;
  let approved = 0;
  let cancelled = 0;
  let firstPass = 0;
  let issued = 0;
  let rework = 0;
  for (const d of docs) {
    const cur = currentRevision(d);
    const live = d.revisions.filter((r) => r.status !== "CANCELLED");
    issued += live.length;
    const reworked = d.revisions.filter((r) => r.status === "COMMENTED" || r.status === "REJECTED").length;
    rework += reworked;
    if (cur?.status === "APPROVED") {
      approved += 1;
      if (reworked === 0) firstPass += 1;
    } else if (cur?.status === "CANCELLED") {
      cancelled += 1;
    }
  }

  let measuredApproved = 0;
  let measuredPending = 0;
  for (const l of input.measurementLines) {
    if (l.status === "APPROVED") measuredApproved += l.amount;
    else if (l.status === "DRAFT" || l.status === "SENT") measuredPending += l.amount;
  }

  const variance =
    opts.endsAt && opts.closedOn
      ? Math.round((utcDay(opts.closedOn) - utcDay(opts.endsAt)) / DAY)
      : null;

  return {
    plannedStart: day(opts.startsAt),
    plannedEnd: day(opts.endsAt),
    closedOn: day(opts.closedOn),
    scheduleVarianceDays: variance,
    tasksTotal: leaves.length,
    tasksDone: leaves.filter((t) => t.status === "DONE").length,
    documentsTotal: docs.length,
    documentsApproved: approved,
    documentsCancelled: cancelled,
    documentsPending: docs.length - approved - cancelled,
    revisionsIssued: issued,
    reworkRevisions: rework,
    firstPassApprovalPct: approved ? Math.round((firstPass / approved) * 100) : null,
    contractedCost: opts.cost,
    measuredApproved: round2(measuredApproved),
    measuredPending: round2(measuredPending),
    valueToMeasure: round2(input.toMeasure.reduce((a, r) => a + r.value, 0)),
  };
}

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/* ---------------------------------------------------------------------- */
/* Validação do termo e da reabertura                                     */
/* ---------------------------------------------------------------------- */

export const TEXT_MAX = 4000;

export interface ClosureForm {
  closureType: string;
  closedOn: string;
  acceptanceRef: string;
  summary: string;
  lessonsKeep: string;
  lessonsImprove: string;
  reason: string;
}

export interface ClosureValue {
  closureType: ClosureType;
  closedOn: Date;
  acceptanceRef: string | null;
  summary: string | null;
  lessonsKeep: string | null;
  lessonsImprove: string | null;
  reason: string | null;
}

/** Justificativa é exigida com pendências abertas ou quando foi interrompido. */
export function closureNeedsReason(closureType: string, pendingCount: number): boolean {
  return pendingCount > 0 || closureType === "INTERRUPTED";
}

export function validateClosure(
  form: ClosureForm,
  ctx: { pendingCount: number; startsAt: Date | null; today: Date },
): { value: ClosureValue } | { error: string } {
  const type = form.closureType;
  if (type !== "COMPLETED" && type !== "INTERRUPTED") {
    return { error: "Escolha se o projeto foi concluído ou interrompido." };
  }
  const closedOn = /^\d{4}-\d{2}-\d{2}$/.test(form.closedOn.trim())
    ? new Date(form.closedOn.trim() + "T00:00:00.000Z")
    : null;
  if (!closedOn || Number.isNaN(closedOn.getTime())) return { error: "Informe a data do encerramento." };
  if (utcDay(closedOn) > utcDay(ctx.today)) return { error: "A data do encerramento não pode ser futura." };
  if (ctx.startsAt && utcDay(closedOn) < utcDay(ctx.startsAt)) {
    return { error: "A data do encerramento não pode ser anterior ao início do projeto." };
  }

  const clean = (v: string) => {
    const s = v.trim();
    return s ? s : null;
  };
  const texts = [form.acceptanceRef, form.summary, form.lessonsKeep, form.lessonsImprove, form.reason];
  if (texts.some((t) => t.trim().length > TEXT_MAX)) {
    return { error: `Cada campo aceita até ${TEXT_MAX} caracteres.` };
  }

  const reason = clean(form.reason);
  if (closureNeedsReason(type, ctx.pendingCount) && !reason) {
    return {
      error:
        type === "INTERRUPTED"
          ? "Explique por que o projeto foi interrompido."
          : "Há pendências abertas: explique por que o projeto pode ser encerrado assim.",
    };
  }

  return {
    value: {
      closureType: type,
      closedOn,
      acceptanceRef: clean(form.acceptanceRef),
      summary: clean(form.summary),
      lessonsKeep: clean(form.lessonsKeep),
      lessonsImprove: clean(form.lessonsImprove),
      reason,
    },
  };
}

export function validateReopen(reason: string): { value: string } | { error: string } {
  const r = reason.trim();
  if (!r) return { error: "Explique por que o projeto está sendo reaberto." };
  if (r.length > TEXT_MAX) return { error: `A justificativa aceita até ${TEXT_MAX} caracteres.` };
  return { value: r };
}
