/**
 * Regras de tarefa — puro, sem Prisma nem Next (testado em test/tasks.test.mjs).
 *
 * Vocabulário: no banco a tabela continua `Milestone` (DRI, sinais e
 * convocações apontam para ela). Na interface ela é **Tarefa**, e "marco" é
 * só um tipo de tarefa: um ponto de verificação sem duração, como no
 * P6/MS Project.
 */

export type TaskKind = "TASK" | "MILESTONE";
export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "BLOCKED" | "DONE";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "CLOSED";

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  TASK: "Tarefa",
  MILESTONE: "Marco",
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: "A fazer",
  IN_PROGRESS: "Em andamento",
  IN_REVIEW: "Em revisão",
  BLOCKED: "Impedida",
  DONE: "Concluída",
};

/**
 * Cor sólida de status no padrão monday: laranja = em andamento,
 * vermelho = parado. Status e prioridade usam escalas diferentes para não
 * confundir "urgente" com "travado".
 */
export const TASK_STATUS_COLOR: Record<TaskStatus, string> = {
  NOT_STARTED: "bg-st-gray",
  IN_PROGRESS: "bg-st-working",
  IN_REVIEW: "bg-st-purple",
  BLOCKED: "bg-st-stuck",
  DONE: "bg-st-done",
};

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "DONE",
  "IN_PROGRESS",
  "IN_REVIEW",
  "NOT_STARTED",
  "BLOCKED",
];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

/** Escala de prioridade do monday: azul → roxo → quase preto. */
export const PRIORITY_COLOR: Record<Priority, string> = {
  LOW: "bg-pr-low",
  MEDIUM: "bg-pr-medium",
  HIGH: "bg-pr-high",
  CRITICAL: "bg-pr-critical",
};

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CLOSED: "Encerrado",
};

/** Só projeto ativo aceita alteração. Pausado e encerrado ficam somente leitura. */
export function isProjectWritable(status: ProjectStatus | string | null | undefined): boolean {
  return status === "ACTIVE";
}

export const READONLY_MESSAGE =
  "Projeto pausado ou encerrado — somente leitura. Reative o projeto para registrar alterações.";

const DAY = 86_400_000;

/** Meia-noite UTC do dia — as datas de tarefa são gravadas como dia em UTC. */
export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface TaskDates {
  kind?: TaskKind | string;
  status: TaskStatus | string;
  progress?: number | null;
  startDate?: Date | null;
  plannedDate: Date | null;
  forecastDate: Date | null;
  actualDate: Date | null;
}

/** Prazo vigente: a previsão, se houver; senão a data planejada (linha de base). */
export function taskDueDate(t: Pick<TaskDates, "plannedDate" | "forecastDate">): Date | null {
  return t.forecastDate ?? t.plannedDate ?? null;
}

export function isTaskOpen(t: Pick<TaskDates, "status">): boolean {
  return t.status !== "DONE";
}

/** Atrasada = em aberto e com prazo anterior a hoje (o próprio dia ainda vale). */
export function isTaskOverdue(t: TaskDates, now: Date): boolean {
  const due = taskDueDate(t);
  if (!isTaskOpen(t) || !due) return false;
  return due.getTime() < startOfDayUTC(now).getTime();
}

/** Dias de deslize da previsão sobre a linha de base (positivo = atrasou). */
export function slipDays(t: Pick<TaskDates, "plannedDate" | "forecastDate">): number | null {
  if (!t.plannedDate || !t.forecastDate) return null;
  return Math.round((t.forecastDate.getTime() - t.plannedDate.getTime()) / DAY);
}

export type ScheduleHealth = "ON_TRACK" | "WATCH" | "LATE" | "NO_DATA";

export const SCHEDULE_LABEL: Record<ScheduleHealth, string> = {
  ON_TRACK: "No prazo",
  WATCH: "Atenção",
  LATE: "Atrasado",
  NO_DATA: "Sem cronograma",
};

export const SCHEDULE_COLOR: Record<ScheduleHealth, string> = {
  ON_TRACK: "bg-st-done",
  WATCH: "bg-st-yellow",
  LATE: "bg-st-stuck",
  NO_DATA: "bg-st-gray",
};

/**
 * Saúde de cronograma de um conjunto de tarefas.
 *
 * - Atrasado: alguma tarefa em aberto passou do prazo.
 * - Atenção: alguma previsão deslizou sobre a linha de base, ou há tarefa
 *   vencendo em até 7 dias com menos da metade feita, ou alguma impedida.
 * - Sem cronograma: nenhuma tarefa com data.
 */
export function scheduleHealth(tasks: TaskDates[], now: Date): ScheduleHealth {
  const dated = tasks.filter((t) => taskDueDate(t));
  if (dated.length === 0) return "NO_DATA";
  if (dated.some((t) => isTaskOverdue(t, now))) return "LATE";

  const today = startOfDayUTC(now).getTime();
  const watch = tasks.some((t) => {
    if (!isTaskOpen(t)) return false;
    if (t.status === "BLOCKED") return true;
    if ((slipDays(t) ?? 0) > 0) return true;
    const due = taskDueDate(t);
    if (!due) return false;
    const daysLeft = (due.getTime() - today) / DAY;
    return daysLeft <= 7 && (t.progress ?? 0) < 50;
  });
  return watch ? "WATCH" : "ON_TRACK";
}

/**
 * Avanço do projeto: média ponderada pela duração de cada tarefa.
 *
 * Marco não tem duração — conta como peso 1 dia (0% ou 100%), para não
 * dominar nem sumir. Tarefa sem datas também pesa 1.
 */
export function projectProgress(tasks: TaskDates[]): number | null {
  if (tasks.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const t of tasks) {
    const end = taskDueDate(t);
    const days =
      t.kind !== "MILESTONE" && t.startDate && end
        ? Math.max(1, Math.round((end.getTime() - t.startDate.getTime()) / DAY))
        : 1;
    const p = t.status === "DONE" ? 100 : clampProgress(t.progress ?? 0);
    weighted += p * days;
    total += days;
  }
  return Math.round(weighted / total);
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Etapa atual: a tarefa em aberto que vence primeiro (em andamento tem prioridade). */
export function currentStage<T extends TaskDates & { name: string }>(tasks: T[]): T | null {
  const open = tasks.filter(isTaskOpen);
  if (open.length === 0) return null;
  const rank = (t: T) => (t.status === "IN_PROGRESS" || t.status === "IN_REVIEW" ? 0 : 1);
  return [...open].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const da = taskDueDate(a)?.getTime() ?? Infinity;
    const db = taskDueDate(b)?.getTime() ?? Infinity;
    return da - db;
  })[0];
}

/* ------------------------------------------------------------------------ */
/* Hierarquia: Marco agrupa Tarefas (2 níveis — marco não entra em marco).    */
/* ------------------------------------------------------------------------ */

export interface HierarchyRow {
  id: string;
  parentId?: string | null;
}

/** Só marco pode ter filhas. */
export function canHaveChildren(kind: TaskKind | string): boolean {
  return kind === "MILESTONE";
}

/** Só tarefa pode ter pai. */
export function canHaveParent(kind: TaskKind | string): boolean {
  return kind === "TASK";
}

export interface ParentCandidate {
  id: string;
  projectId: string;
  kind: TaskKind | string;
  parentId?: string | null;
}

/**
 * Valida um vínculo tarefa→marco antes de gravar. Regras: só tarefa tem pai,
 * só marco é pai, mesmo projeto, e o marco escolhido não pode ele próprio
 * estar dentro de outro marco (não há 3º nível).
 */
export function validateParentLink(
  child: { id?: string; projectId: string; kind: TaskKind | string },
  parent: ParentCandidate | null,
): string | null {
  if (!parent) return null;
  if (!canHaveParent(child.kind)) return "Só tarefa pode pertencer a um marco.";
  if (!canHaveChildren(parent.kind)) return "O item selecionado não é um marco.";
  if (parent.projectId !== child.projectId) return "O marco precisa ser do mesmo projeto.";
  if (parent.parentId) return "Um marco não pode estar dentro de outro marco.";
  if (child.id && parent.id === child.id) return "Uma tarefa não pode ser pai dela mesma.";
  return null;
}

/**
 * Só as "folhas" contam para avanço/cronograma do projeto: toda Tarefa, e
 * todo Marco sem filhas (marco com filhas é só o rótulo do grupo — seu
 * estado vem de `rollupMilestone`, não deve ser somado de novo).
 */
export function leafTasks<T extends HierarchyRow>(tasks: T[]): T[] {
  const parentIds = new Set(tasks.map((t) => t.parentId).filter((id): id is string => !!id));
  return tasks.filter((t) => !parentIds.has(t.id));
}

export interface RollupResult {
  status: TaskStatus;
  progress: number;
  forecastDate: Date | null;
  actualDate: Date | null;
}

/**
 * Estado do Marco a partir das Tarefas filhas — não é digitado, é a soma do
 * que existe abaixo. Prazo previsto = o mais tardio das filhas (o marco só é
 * alcançado quando a última terminar); prazo real só é preenchido quando
 * todas as filhas estiverem concluídas.
 */
export function rollupMilestone(children: TaskDates[]): RollupResult {
  if (children.length === 0) {
    return { status: "NOT_STARTED", progress: 0, forecastDate: null, actualDate: null };
  }
  const progress = projectProgress(children) ?? 0;
  const allDone = children.every((c) => c.status === "DONE");
  const anyBlocked = children.some((c) => c.status === "BLOCKED");
  const anyStarted = children.some((c) => c.status !== "NOT_STARTED");
  const status: TaskStatus = allDone
    ? "DONE"
    : anyBlocked
      ? "BLOCKED"
      : anyStarted
        ? "IN_PROGRESS"
        : "NOT_STARTED";

  const dues = children.map((c) => taskDueDate(c)).filter((d): d is Date => !!d);
  const forecastDate = dues.length ? new Date(Math.max(...dues.map((d) => d.getTime()))) : null;

  const actuals = children.map((c) => c.actualDate).filter((d): d is Date => !!d);
  const actualDate =
    allDone && actuals.length === children.length
      ? new Date(Math.max(...actuals.map((d) => d.getTime())))
      : null;

  return { status, progress, forecastDate, actualDate };
}

/* ------------------------------------------------------------------------ */
/* Histórico de reprogramação (DeadlineChange)                              */
/* ------------------------------------------------------------------------ */

export interface DeadlineChangeDraft {
  fromDate: Date | null;
  toDate: Date;
}

/**
 * Registro de histórico a gravar quando um prazo (forecastDate de tarefa,
 * ou dueAt de solicitação) muda — ou null se não houve mudança de fato.
 * `previous` nulo na primeira gravação não gera histórico (não havia prazo
 * anterior para comparar); só reprogramação de um prazo já existente conta.
 */
export function buildDeadlineChange(previous: Date | null, next: Date | null): DeadlineChangeDraft | null {
  if (!next) return null;
  if (!previous) return null;
  if (previous.getTime() === next.getTime()) return null;
  return { fromDate: previous, toDate: next };
}

/**
 * Consequências de mudar status/avanço, aplicadas no servidor:
 * concluir fecha em 100% e grava a data real; reabrir limpa a data real;
 * marco não tem início.
 */
export function normalizeTaskUpdate(
  input: {
    kind: TaskKind;
    status: TaskStatus;
    progress: number;
    startDate: Date | null;
    actualDate: Date | null;
  },
  now: Date,
): { status: TaskStatus; progress: number; startDate: Date | null; actualDate: Date | null } {
  let { status, progress, startDate, actualDate } = input;
  progress = clampProgress(progress);

  if (input.kind === "MILESTONE") {
    startDate = null;
    if (status !== "DONE") progress = 0;
  }
  if (status === "DONE") {
    progress = 100;
    actualDate = actualDate ?? startOfDayUTC(now);
  } else {
    actualDate = null;
    if (progress >= 100) progress = 99;
  }
  return { status, progress, startDate, actualDate };
}

/** "Hoje", "Amanhã", "Ontem" ou "15 set". */
export function relativeDueLabel(due: Date | null, now: Date): string {
  if (!due) return "—";
  const diff = Math.round((startOfDayUTC(due).getTime() - startOfDayUTC(now).getTime()) / DAY);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff === -1) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(due)
    .replace(".", "");
}
