import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { Card, SectionTitle, DRIBadge, Empty, Button } from "@/components/ui";
import { HumanSignalForm } from "@/components/human-signal-form";
import { DRITrendChart, type TrendPoint } from "@/components/dri-trend-chart";
import { MilestoneDemands } from "@/components/milestone-demands";
import {
  Avatar,
  DeadlineHistoryList,
  KindMark,
  PriorityCell,
  ProgressBar,
  ReadOnlyBanner,
  TaskStatusCell,
} from "@/components/task-ui";
import { ImpedimentForm, TaskEditForm } from "@/components/task-forms";
import { RequestCreateForm } from "@/components/request-forms";
import { RequestTable } from "@/components/request-table";
import { FormPanel } from "@/components/form-panel";
import { resolveImpediment } from "@/app/actions/tasks";
import { formatCurrency, formatDate, formatDateTime, toNumber } from "@/lib/format";
import { requireUser, canManageProjects } from "@/lib/authz";
import {
  isProjectWritable,
  isTaskOverdue,
  slipDays,
  taskDueDate,
  TASK_KIND_LABEL,
} from "@/lib/tasks";
import { isRequestOpen } from "@/lib/requests";
import type { MilestoneDetailRow, MilestoneRequestRow, UserOption } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string; taskId: string }>;
}) {
  const { id, taskId } = await params;
  const user = await requireUser(`/projects/${id}/tasks/${taskId}`);

  const task: MilestoneDetailRow | null = await prisma.milestone.findFirst({
    where: { id: taskId, projectId: id, project: { organizationId: user.organizationId } },
    include: {
      project: { select: { id: true, name: true, currency: true, status: true } },
      assignee: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true } },
      children: {
        orderBy: [{ plannedDate: "asc" }, { createdAt: "asc" }],
        include: {
          assignee: { select: { id: true, name: true } },
          driScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
          _count: {
            select: {
              humanSignals: true,
              systemicSignals: true,
              impediments: { where: { resolvedAt: null } },
              requests: { where: { status: "PENDING" } },
            },
          },
        },
      },
      driScores: { orderBy: { calculatedAt: "asc" }, take: 60 },
      humanSignals: { orderBy: { createdAt: "desc" }, take: 20 },
      systemicSignals: { orderBy: { referenceDate: "desc" }, take: 10 },
      impediments: {
        orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
        take: 30,
        select: {
          id: true,
          description: true,
          waitingOn: true,
          createdAt: true,
          resolvedAt: true,
          owner: { select: { id: true, name: true } },
        },
      },
      requests: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        include: {
          owner: { select: { id: true, name: true } },
          milestone: { select: { id: true, name: true } },
          documents: { include: { document: { select: { id: true, number: true, name: true } } } },
        },
      },
      deadlineChanges: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });

  if (!task) notFound();

  const milestoneOptions =
    task.kind === "TASK"
      ? await prisma.milestone.findMany({
          where: { projectId: id, kind: "MILESTONE", parentId: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  const documentOptions = await prisma.document.findMany({
    where: { projectId: id },
    select: { id: true, number: true, name: true },
    orderBy: [{ number: "asc" }, { name: "asc" }],
  });

  const [requests, candidates]: [MilestoneRequestRow[], UserOption[]] = await Promise.all([
    prisma.signalRequest.findMany({
      where: { milestoneId: taskId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        dueAt: true,
        createdAt: true,
        answeredAt: true,
        assignee: { select: { id: true, name: true, function: { select: { name: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { isActive: true, organizationId: user.organizationId },
      select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const now = new Date();
  const manage = canManageProjects(user);
  const writable = isProjectWritable(task.project.status);
  const isAssignee = task.assignee?.id === user.id;
  const canEdit = writable && (manage || isAssignee);
  const evaluators = candidates.filter((u) => u.role !== "EXECUTIVE");

  const latest = task.driScores[task.driScores.length - 1];
  const breakdown = (latest?.breakdown ?? {}) as Record<string, unknown>;
  const confidence = typeof breakdown.confidence === "number" ? breakdown.confidence : null;
  const trend: TrendPoint[] = task.driScores.map((s) => ({
    date: formatDate(s.calculatedAt),
    score: Math.round(s.score * 10) / 10,
  }));

  const due = taskDueDate(task);
  const late = isTaskOverdue(task, now);
  const slip = slipDays(task);
  const openImpediments = task.impediments.filter((i) => !i.resolvedAt);
  const isGroup = task.children.length > 0;
  const openTaskRequests = task.requests.filter(isRequestOpen).length;

  return (
    <div className="space-y-8">
      <section>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
          <Link href={`/projects/${id}`} className="hover:text-ink-soft">
            ← {task.project.name}
          </Link>
          {task.parent ? (
            <>
              <span>/</span>
              <Link href={`/projects/${id}/tasks/${task.parent.id}`} className="hover:text-ink-soft">
                {task.parent.name}
              </Link>
            </>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <KindMark kind={task.kind} />
            <h1 className="text-2xl font-semibold tracking-tight">{task.name}</h1>
            <TaskStatusCell status={task.status} />
            <PriorityCell value={task.criticality} />
          </div>
          <DRIBadge score={latest?.score ?? 0} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {TASK_KIND_LABEL[task.kind]}
          {task.type ? ` · ${task.type}` : ""}
          {confidence != null ? ` · confiança do cálculo ${Math.round(confidence * 100)}%` : ""}
        </p>
      </section>

      <ReadOnlyBanner status={task.project.status} projectId={id} canReactivate={manage} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Responsável</p>
          <div className="mt-3 flex items-center gap-2.5">
            <Avatar name={task.assignee?.name} size={32} />
            <span className="text-sm font-medium">{task.assignee?.name ?? "Sem responsável"}</span>
          </div>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Prazo</p>
          <p className={clsx("mt-2 text-xl font-semibold tabular-nums", late && "text-st-stuck")}>
            {formatDate(task.actualDate ?? due)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {task.actualDate
              ? "Concluída nesta data"
              : `Base ${formatDate(task.plannedDate)}${slip && slip > 0 ? ` · deslize +${slip} dia(s)` : ""}${late ? " · atrasada" : ""}`}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Avanço</p>
          <div className="mt-4">
            {task.kind === "MILESTONE" ? (
              <span className="text-sm text-ink-soft">{task.status === "DONE" ? "Marco atingido" : "Marco pendente"}</span>
            ) : (
              <ProgressBar value={task.progress} />
            )}
          </div>
          {task.startDate ? <p className="mt-3 text-xs text-ink-soft">Início {formatDate(task.startDate)}</p> : null}
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Impacto econômico</p>
          <p className="mt-2 text-xl font-semibold tabular-nums">
            {formatCurrency(toNumber(task.economicImpact), task.project.currency)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Perda estimada se a tarefa falhar</p>
        </Card>
      </section>

      {canEdit ? (
        <section>
          <SectionTitle hint={manage ? "Gerente edita escopo e linha de base" : "Como responsável, você atualiza status, avanço e previsão"}>
            Atualizar tarefa
          </SectionTitle>
          <Card>
            <TaskEditForm
              fullEdit={manage}
              users={candidates}
              milestoneOptions={milestoneOptions}
              childCount={task.children.length}
              task={{
                id: task.id,
                name: task.name,
                kind: task.kind,
                type: task.type,
                criticality: task.criticality,
                status: task.status,
                progress: task.progress,
                startDate: task.startDate,
                plannedDate: task.plannedDate,
                forecastDate: task.forecastDate,
                actualDate: task.actualDate,
                assigneeId: task.assignee?.id ?? null,
                parentId: task.parentId,
              }}
            />
          </Card>
        </section>
      ) : null}

      {isGroup ? (
        <section>
          <SectionTitle hint={`${task.children.length} tarefa(s) — status e prazo deste marco vêm delas`}>
            Tarefas do marco
          </SectionTitle>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <ul className="divide-y divide-line">
              {task.children.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={c.assignee?.name} size={26} />
                    <Link href={`/projects/${id}/tasks/${c.id}`} className="truncate text-sm text-ink hover:text-accent">
                      {c.name}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={c.progress} />
                    <TaskStatusCell status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <SectionTitle hint="Documento de referência, informação complementar — tudo que precisa ser cobrado até concluir">
          Solicitações{openTaskRequests > 0 ? ` (${openTaskRequests} em aberto)` : ""}
        </SectionTitle>
        <RequestTable
          requests={task.requests}
          now={now}
          projectId={id}
          writable={writable}
          manage={manage}
          currentUserId={user.id}
          showLink={false}
          quickAdd={writable ? { milestoneId: task.id, users: candidates } : undefined}
        />
        {writable ? (
          <FormPanel id="nova-solicitacao" label="Nova solicitação — formulário completo">
            <RequestCreateForm projectId={id} milestoneId={task.id} users={candidates} documents={documentOptions} />
          </FormPanel>
        ) : null}
      </section>

      <section>
        <SectionTitle hint="Reprogramações desta tarefa/marco">Histórico de prazo</SectionTitle>
        <Card>
          <DeadlineHistoryList changes={task.deadlineChanges} />
        </Card>
      </section>

      <section>
        <SectionTitle hint={`${openImpediments.length} aberto(s)`}>Impedimentos</SectionTitle>
        <Card className="space-y-5">
          {task.impediments.length === 0 ? (
            <Empty>Nenhum impedimento registrado.</Empty>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {task.impediments.map((imp) => (
                <li key={imp.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className={clsx("text-sm", imp.resolvedAt ? "text-ink-faint line-through" : "font-medium text-ink")}>
                      {imp.description}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {[
                        imp.waitingOn ? `depende de ${imp.waitingOn}` : null,
                        imp.owner ? `destrava: ${imp.owner.name}` : null,
                        `aberto em ${formatDate(imp.createdAt)}`,
                        imp.resolvedAt ? `resolvido em ${formatDate(imp.resolvedAt)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {!imp.resolvedAt && canEdit ? (
                    <form action={resolveImpediment}>
                      <input type="hidden" name="impedimentId" value={imp.id} />
                      <Button type="submit" variant="outline" className="px-2.5 py-1 text-xs">
                        Marcar resolvido
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <div className="border-t border-line pt-5">
              <ImpedimentForm taskId={task.id} users={candidates} />
            </div>
          ) : null}
        </Card>
      </section>

      {manage ? (
        <section>
          <SectionTitle hint={`${requests.length} convocação(ões)`}>Demandas de avaliação</SectionTitle>
          <Card>
            <MilestoneDemands milestoneId={task.id} requests={requests} candidates={evaluators} readOnly={!writable} />
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint="Camada 2">Registrar avaliação</SectionTitle>
          <Card>
            {writable ? (
              <HumanSignalForm milestoneId={task.id} />
            ) : (
              <p className="text-sm text-ink-soft">Projeto somente leitura — avaliações encerradas.</p>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle>Tendência da tarefa</SectionTitle>
            <Card>
              <DRITrendChart data={trend} />
            </Card>
          </div>

          <div>
            <SectionTitle hint={`${task.humanSignals.length} registro(s)`}>Sinais humanos recentes</SectionTitle>
            {task.humanSignals.length === 0 ? (
              <Empty>Nenhuma avaliação ainda.</Empty>
            ) : (
              <ul className="space-y-2">
                {task.humanSignals.map((s) => (
                  <li key={s.id}>
                    <Card className="p-4">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {s.failureProbability}% de falha · confiança {s.planConfidence}/5
                        </span>
                        <span className="text-xs text-ink-soft">{formatDateTime(s.createdAt)}</span>
                      </div>
                      {s.perceivedBottleneck ? (
                        <p className="mt-2 text-sm text-ink">&ldquo;{s.perceivedBottleneck}&rdquo;</p>
                      ) : null}
                      <p className="mt-2 text-xs text-ink-soft">
                        {s.respondentRole ?? "Papel não informado"}
                        {s.blockedDecision ? " · decisão travada" : ""}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <SectionTitle hint="Camada 1">Sinais sistêmicos recentes</SectionTitle>
            {task.systemicSignals.length === 0 ? (
              <Empty>Nenhum dado importado para esta tarefa.</Empty>
            ) : (
              <ul className="space-y-2">
                {task.systemicSignals.map((s) => (
                  <li key={s.id}>
                    <Card className="p-4 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">
                          {s.delayDays != null
                            ? `${s.delayDays > 0 ? "+" : ""}${s.delayDays} dia(s)`
                            : "Sem atraso apurado"}
                        </span>
                        <span className="text-xs text-ink-soft">
                          {s.source} · {formatDate(s.referenceDate)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-soft">
                        Custo previsto {formatCurrency(toNumber(s.plannedCost), task.project.currency)} ·
                        realizado {formatCurrency(toNumber(s.actualCost), task.project.currency)}
                      </p>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
