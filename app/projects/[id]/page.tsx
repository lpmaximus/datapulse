import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { AlertCircle, ChevronDown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  recalculateNow,
  setProjectManager,
  addProjectMember,
  removeProjectMember,
} from "@/app/actions/projects";
import { requireUser, canManageProjects } from "@/lib/authz";
import { Card, SectionTitle, DRIBadge, Bar, Button, Field, inputClass, Empty } from "@/components/ui";
import { Th, Td } from "@/components/table-ui";
import { DRITrendChart, type TrendPoint } from "@/components/dri-trend-chart";
import { GanttChart } from "@/components/gantt";
import {
  Avatar,
  KindMark,
  PriorityCell,
  ProgressBar,
  ReadOnlyBanner,
  ScheduleChip,
  TaskStatusCell,
} from "@/components/task-ui";
import { TaskCreateForm } from "@/components/task-forms";
import { TaskQuickAdd } from "@/components/task-quick-add";
import { Modal } from "@/components/modal";
import { TaskDetail } from "@/components/task-detail";
import { RequestDetail } from "@/components/request-detail";
import { DeleteButton } from "@/components/delete-button";
import { deleteTask } from "@/app/actions/tasks";
import { ClickableRow } from "@/components/clickable-row";
import { RequestCreateForm } from "@/components/request-forms";
import { RequestTable } from "@/components/request-table";
import { formatCurrency, formatDate, formatDateTime, toNumber } from "@/lib/format";
import { BAND_LABEL, driBand } from "@/lib/dri";
import {
  isProjectWritable,
  isTaskOpen,
  isTaskOverdue,
  leafTasks,
  projectProgress,
  scheduleHealth,
  slipDays,
  taskDueDate,
  TASK_STATUS_COLOR,
} from "@/lib/tasks";
import { isRequestOpen } from "@/lib/requests";
import type { ProjectDetailRow, ProjectTaskRow, UserOption, ProjectMemberRow, RequestRow } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ task?: string; request?: string }>;
}) {
  const { id } = await params;
  const { task: openTask, request: openRequest } = await searchParams;
  const user = await requireUser(`/projects/${id}`);

  const project: ProjectDetailRow | null = await prisma.project.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      milestones: {
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
      requests: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
        include: {
          owner: { select: { id: true, name: true } },
          milestone: { select: { id: true, name: true } },
          documents: { include: { document: { select: { id: true, number: true, name: true } } } },
        },
      },
      driScores: { where: { milestoneId: null }, orderBy: { calculatedAt: "asc" }, take: 60 },
      manager: { select: { id: true, name: true, function: { select: { name: true } } } },
      clientRef: { select: { id: true, name: true } },
      sector: { select: { id: true, name: true } },
      designFirm: { select: { id: true, name: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          roleInProject: true,
          user: { select: { id: true, name: true, function: { select: { name: true } }, role: true } },
        },
      },
      _count: { select: { documents: true } },
    },
  });

  if (!project) notFound();

  const allUsers: UserOption[] = await prisma.user.findMany({
    where: { isActive: true, organizationId: user.organizationId },
    select: { id: true, name: true, email: true, role: true, function: { select: { name: true } } },
    orderBy: { name: "asc" },
  });

  // Opções para "Função no projeto" — vêm do mesmo cadastro (Configurações
  // > Cadastros > Funções) usado na função global do usuário, para não
  // deixar cada gerente digitar um rótulo diferente para a mesma função.
  const jobFunctions = await prisma.jobFunction.findMany({
    where: { isActive: true, organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { name: true },
  });

  const documentOptions = await prisma.document.findMany({
    where: { projectId: id },
    select: { id: true, number: true, name: true },
    orderBy: [{ number: "asc" }, { name: "asc" }],
  });

  const now = new Date();
  const manage = canManageProjects(user);
  const writable = isProjectWritable(project.status);

  const managers = allUsers.filter((u) => u.role === "ADMIN" || u.role === "MANAGER");
  const memberIds = new Set(project.members.map((m: ProjectMemberRow) => m.user.id));
  const availableMembers = allUsers.filter((u) => !memberIds.has(u.id));

  const latest = project.driScores[project.driScores.length - 1];
  const projectScore = latest?.score ?? 0;
  const trend: TrendPoint[] = project.driScores.map((s) => ({
    date: formatDate(s.calculatedAt),
    score: Math.round(s.score * 10) / 10,
  }));

  const tasks = project.milestones;
  const scoreOf = (t: ProjectTaskRow) => t.driScores[0]?.score ?? 0;

  // Marco agrupa Tarefas (2 níveis): monta a árvore para a tabela e o Gantt.
  const byParent = new Map<string, ProjectTaskRow[]>();
  for (const t of tasks) {
    if (!t.parentId) continue;
    const arr = byParent.get(t.parentId) ?? [];
    arr.push(t);
    byParent.set(t.parentId, arr);
  }
  const tree: ProjectTaskRow[] = tasks
    .filter((t) => !t.parentId)
    .map((t) => ({ ...t, children: byParent.get(t.id) ?? [] }));

  // Escolhida do topo — status do marco já vem calculado das filhas (rollup no servidor).
  const openTree = tree.filter(isTaskOpen).sort((a, b) => scoreOf(b) - scoreOf(a));
  const doneTree = tree
    .filter((t) => !isTaskOpen(t))
    .sort((a, b) => (b.actualDate?.getTime() ?? 0) - (a.actualDate?.getTime() ?? 0));

  // Só as folhas contam para avanço/cronograma — marco com filhas não soma de novo.
  const leaves = leafTasks(tasks);
  // Restrição dominante olha qualquer tarefa/marco (também os com filhas — DRI do
  // marco vem de sinais próprios, não do rollup), não só o topo da árvore.
  const openFlat = tasks.filter(isTaskOpen).sort((a, b) => scoreOf(b) - scoreOf(a));
  const dominant = openFlat[0] && scoreOf(openFlat[0]) > 0 ? openFlat[0] : null;
  const progress = projectProgress(leaves);
  const health = scheduleHealth(leaves, now);
  const openImpediments = tasks.reduce((a, t) => a + t._count.impediments, 0);
  const openRequests = project.requests.filter(isRequestOpen).length;
  const overdue = leaves.filter((t) => isTaskOpen(t) && isTaskOverdue(t, now)).length;
  const milestoneOptions = tree
    .filter((t) => t.kind === "MILESTONE")
    .map((t) => ({ id: t.id, name: t.name }));

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-xs text-ink-faint hover:text-ink-soft">
            ← Projetos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[
              project.clientRef?.name,
              project.sector?.name,
              project.osNumber ? `OS ${project.osNumber}` : null,
              project.designFirm ? `empresa ${project.designFirm.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Sem cliente definido"}
            {project.manager ? ` · gerente ${project.manager.name}` : " · sem gerente"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/projects/${project.id}/documents`}>
            <Button variant="outline">Documentos ({project._count.documents})</Button>
          </Link>
          {manage && writable ? (
            <>
              <Link href={`/projects/${project.id}/import`}>
                <Button variant="outline">Importar planilha</Button>
              </Link>
              <form action={recalculateNow}>
                <input type="hidden" name="projectId" value={project.id} />
                <Button variant="outline" type="submit">Recalcular DRI</Button>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <ReadOnlyBanner status={project.status} projectId={project.id} canReactivate={manage} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">DRI do projeto</p>
          <div className="mt-3">
            <DRIBadge score={projectScore} />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {latest ? `Calculado em ${formatDateTime(latest.calculatedAt)}` : "Ainda não calculado"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Avanço físico</p>
          <div className="mt-4">
            <ProgressBar value={progress} />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {leaves.filter((t) => !isTaskOpen(t)).length} de {leaves.length} tarefa(s) concluída(s) · ponderado pela duração
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Cronograma</p>
          <div className="mt-3">
            <ScheduleChip health={health} />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {overdue > 0 ? `${overdue} tarefa(s) atrasada(s)` : "Nenhuma tarefa atrasada"}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Impedimentos abertos</p>
          <p
            className={clsx(
              "mt-2 text-3xl font-semibold tabular-nums",
              openImpediments > 0 ? "text-st-stuck" : "text-ink",
            )}
          >
            {openImpediments}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Registrados na página de cada tarefa</p>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">Restrição dominante</p>
          {dominant ? (
            <>
              <Link
                href={`/projects/${project.id}/tasks/${dominant.id}`}
                className="mt-2 block text-lg font-medium hover:text-accent"
              >
                {dominant.name}
              </Link>
              <p className="mt-1 text-sm text-ink-soft">
                {BAND_LABEL[driBand(scoreOf(dominant))]} · impacto econômico{" "}
                {formatCurrency(toNumber(dominant.economicImpact), project.currency)}
                {dominant.assignee ? ` · ${dominant.assignee.name}` : " · sem responsável"}
              </p>
              <div className="mt-3">
                <Bar value={scoreOf(dominant)} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              Sem sinais suficientes. Importe uma planilha (Camada 1) ou colete
              avaliações (Camada 2) para o DRI ter o que ler.
            </p>
          )}
        </Card>
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wider text-ink-soft">Tendência do DRI</p>
          <DRITrendChart data={trend} />
        </Card>
      </section>

      <section>
        <SectionTitle hint="Semanas · barra = início → prazo vigente">Linha do tempo</SectionTitle>
        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          <GanttChart
            now={now}
            emptyText="Nenhuma tarefa com datas. Informe início e término planejado."
            rows={ganttOrder(tree, now).map(({ task: t, depth }) => ({
              id: t.id,
              label: t.name,
              sublabel: t.kind === "MILESTONE" ? "Marco" : `${t.progress}%`,
              href: `/projects/${project.id}/tasks/${t.id}`,
              start: t.kind === "MILESTONE" ? null : t.startDate,
              end: t.actualDate ?? taskDueDate(t),
              milestone: t.kind === "MILESTONE",
              baselineEnd: t.plannedDate,
              progress: t.kind === "MILESTONE" ? null : t.progress,
              tone: isTaskOverdue(t, now) ? "bg-st-stuck" : TASK_STATUS_COLOR[t.status],
              owner: t.assignee?.name ?? null,
              depth,
            }))}
          />
        </div>
      </section>

      <section className="space-y-6">
        <SectionTitle hint="Em aberto ordenadas por DRI — intervir de cima para baixo">
          Tarefas
        </SectionTitle>
        {tasks.length === 0 && !(manage && writable) ? (
          <Empty>Nenhuma tarefa cadastrada. Adicione abaixo ou importe uma planilha.</Empty>
        ) : (
          <>
            <TaskGroup
              title="Em aberto"
              tone="accent"
              tasks={openTree}
              projectId={project.id}
              now={now}
              currency={project.currency}
              quickAdd={manage && writable ? <TaskQuickAdd projectId={project.id} users={allUsers} /> : undefined}
              canDelete={manage && writable}
            />
            {doneTree.length > 0 ? (
              <TaskGroup title="Concluídas" tone="done" tasks={doneTree} projectId={project.id} now={now} currency={project.currency} collapsed canDelete={manage && writable} />
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle hint="Documento de referência, informação complementar — tudo que precisa ser cobrado até concluir">
          Solicitações{openRequests > 0 ? ` (${openRequests} em aberto)` : ""}
        </SectionTitle>
        <RequestTable
          requests={project.requests}
          now={now}
          projectId={project.id}
          writable={writable}
          manage={manage}
          currentUserId={user.id}
          quickAdd={writable ? { users: allUsers } : undefined}
        />
      </section>

      {openTask ? (
        <Modal title="Tarefa" fullHref={`/projects/${id}/tasks/${openTask}`}>
          <TaskDetail id={id} taskId={openTask} user={user} variant="modal" />
        </Modal>
      ) : null}
      {openRequest ? (
        <Modal title="Solicitação" fullHref={`/projects/${id}/requests/${openRequest}`}>
          <RequestDetail id={id} requestId={openRequest} user={user} variant="modal" />
        </Modal>
      ) : null}

      {manage ? (
        <section>
          <SectionTitle hint={`${project.members.length} pessoa(s) alocada(s)`}>Equipe do projeto</SectionTitle>
          <Card className="space-y-5">
            <form action={setProjectManager} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <input type="hidden" name="projectId" value={project.id} />
              <Field label="Gerente do projeto" hint="Responde pelo DRI e convoca as avaliações.">
                <select name="managerId" defaultValue={project.manager?.id ?? ""} className={inputClass}>
                  <option value="">Sem gerente</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.function ? ` — ${m.function.name}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit" variant="outline">Salvar gerente</Button>
            </form>

            {project.members.length > 0 ? (
              <ul className="divide-y divide-line rounded-md border border-line">
                {project.members.map((m: ProjectMemberRow) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={m.user.name} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{m.user.name}</p>
                        <p className="text-xs text-ink-faint">
                          {m.roleInProject ?? m.user.function?.name ?? "sem função definida"}
                        </p>
                      </div>
                    </div>
                    <form action={removeProjectMember}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="userId" value={m.user.id} />
                      <Button type="submit" variant="ghost" className="px-2 py-1 text-xs">
                        Remover
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>
                Ninguém alocado. A alocação define quem enxerga os documentos deste
                projeto em &ldquo;Minhas demandas&rdquo;.
              </Empty>
            )}

            {availableMembers.length > 0 ? (
              <form action={addProjectMember} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="projectId" value={project.id} />
                <Field label="Alocar pessoa">
                  <select name="userId" required className={inputClass}>
                    {availableMembers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.function ? ` — ${u.function.name}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Função no projeto" hint="Sobrescreve a função global só neste projeto.">
                  <select name="roleInProject" defaultValue="" className={inputClass}>
                    <option value="">Usar função do cadastro</option>
                    {jobFunctions.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit">Alocar</Button>
              </form>
            ) : null}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

/** Ordem do Gantt: cada marco de topo seguido pelas suas tarefas filhas, indentadas. */
function ganttOrder(
  tree: ProjectTaskRow[],
  now: Date,
): { task: ProjectTaskRow; depth: number }[] {
  const byStart = (a: ProjectTaskRow, b: ProjectTaskRow) =>
    (a.startDate ?? taskDueDate(a) ?? now).getTime() - (b.startDate ?? taskDueDate(b) ?? now).getTime();
  const rows: { task: ProjectTaskRow; depth: number }[] = [];
  for (const t of [...tree].sort(byStart)) {
    rows.push({ task: t, depth: 0 });
    for (const c of [...(t.children ?? [])].sort(byStart)) rows.push({ task: c, depth: 1 });
  }
  return rows;
}

function TaskGroup({
  title,
  tone,
  tasks,
  projectId,
  now,
  currency,
  collapsed = false,
  quickAdd,
  canDelete = false,
}: {
  title: string;
  tone: "accent" | "done";
  tasks: ProjectTaskRow[];
  projectId: string;
  now: Date;
  currency: string;
  collapsed?: boolean;
  /** Linha de cadastro direto ao final da lista. */
  quickAdd?: React.ReactNode;
  /** Mostra o botão de excluir em cada linha. */
  canDelete?: boolean;
}) {
  function taskRow(t: ProjectTaskRow, depth: number) {
    const due = t.actualDate ?? taskDueDate(t);
    const late = isTaskOverdue(t, now);
    const slip = slipDays(t);
    const score = t.driScores[0]?.score ?? 0;
    return (
      <ClickableRow key={t.id} openParam="task" openId={t.id} className="border-b border-line hover:bg-canvas">
        <Td className="max-w-[340px] pl-5">
          <div className="flex items-center gap-2" style={depth ? { paddingLeft: `${depth * 18}px` } : undefined}>
            <KindMark kind={t.kind} />
            <span className="truncate text-ink">{t.name}</span>
            {t._count.impediments > 0 ? (
              <span className="shrink-0 rounded-full bg-st-stuck/10 px-1.5 text-[11px] font-medium text-st-stuck">
                {t._count.impediments} impedimento(s)
              </span>
            ) : null}
            {t._count.requests > 0 ? (
              <span className="shrink-0 rounded-full bg-st-working/10 px-1.5 text-[11px] font-medium text-st-working">
                {t._count.requests} solicitação(ões)
              </span>
            ) : null}
          </div>
          {t.type ? <p className="truncate text-xs text-ink-faint">{t.type}</p> : null}
        </Td>
        <Td className="text-center">
          <span className="inline-flex items-center gap-2">
            <Avatar name={t.assignee?.name} />
            {t.assignee ? <span className="max-w-[110px] truncate text-ink-soft">{t.assignee.name}</span> : null}
          </span>
        </Td>
        <td className="h-px border-r border-line p-0">
          <TaskStatusCell status={t.status} fill />
        </td>
        <td className="h-px border-r border-line p-0">
          <PriorityCell value={t.criticality} fill />
        </td>
        <Td>{t.kind === "MILESTONE" ? <span className="text-xs text-ink-faint">marco</span> : <ProgressBar value={t.progress} />}</Td>
        <Td className="text-center text-ink-soft">{t.kind === "MILESTONE" ? "—" : formatDate(t.startDate)}</Td>
        <Td className="text-center">
          <span className="inline-flex items-center gap-1.5">
            {late ? <AlertCircle size={14} className="text-st-stuck" aria-label="Atrasada" /> : null}
            <span className={clsx("tabular-nums", late ? "text-st-stuck" : "text-ink-soft")}>{formatDate(due)}</span>
            {slip != null && slip > 0 && !t.actualDate ? (
              <span title="Deslize da previsão sobre a linha de base" className="text-[11px] text-st-stuck">
                +{slip}d
              </span>
            ) : null}
          </span>
        </Td>
        <Td align="right">{formatCurrency(toNumber(t.economicImpact), currency)}</Td>
        <Td>{score > 0 ? <DRIBadge score={score} showLabel={false} /> : <span className="text-ink-faint">—</span>}</Td>
        <Td className="w-10 text-center">
          {canDelete ? (
            <DeleteButton
              compact
              action={deleteTask}
              idField="taskId"
              id={t.id}
              confirm={
                (t.children ?? []).length > 0
                  ? "Excluir este marco? As tarefas dele ficam sem marco."
                  : "Excluir esta tarefa e o histórico dela?"
              }
            />
          ) : null}
        </Td>
      </ClickableRow>
    );
  }

  return (
    <details open={!collapsed} className="group">
      <summary
        className={clsx(
          "mb-2 flex cursor-pointer list-none items-center gap-1.5 text-lg font-medium [&::-webkit-details-marker]:hidden",
          tone === "accent" ? "text-accent" : "text-st-done",
        )}
      >
        <ChevronDown size={18} className="-rotate-90 transition-transform group-open:rotate-0" />
        {title}
        <span className="ml-1 text-sm font-normal text-ink-faint">{tasks.length}</span>
      </summary>

      <div className="dp-scroll relative overflow-x-auto">
        <span
          aria-hidden
          className={clsx("absolute inset-y-0 left-0 w-1.5 rounded-l-md", tone === "accent" ? "bg-accent" : "bg-st-done")}
        />
        <table className="w-full border-collapse border-y border-r border-line">
          <thead className="bg-surface">
            <tr>
              <Th className="min-w-[260px] pl-5">Tarefa</Th>
              <Th>Responsável</Th>
              <Th className="w-[130px]">Status</Th>
              <Th className="w-[100px]">Prioridade</Th>
              <Th className="min-w-[150px]">Avanço</Th>
              <Th>Início</Th>
              <Th className="w-[140px]">Prazo</Th>
              <Th align="right">Impacto</Th>
              <Th>DRI</Th>
              <Th className="w-10">
                <span className="sr-only">Excluir</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-3 pl-6 text-sm text-ink-faint">
                  Nenhuma tarefa neste grupo.
                </td>
              </tr>
            ) : (
              tasks.flatMap((t) => [
                taskRow(t, 0),
                ...(t.children ?? []).map((c) => taskRow(c, 1)),
              ])
            )}
            {quickAdd}
          </tbody>
        </table>
      </div>
    </details>
  );
}
