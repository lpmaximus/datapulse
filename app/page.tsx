import Link from "next/link";
import clsx from "clsx";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Flame,
  OctagonAlert,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser, canManageProjects } from "@/lib/authz";
import { Button, DRIBadge, Empty } from "@/components/ui";
import { Th, Td } from "@/components/table-ui";
import { GanttChart } from "@/components/gantt";
import { DashboardFilters } from "@/components/dashboard-filters";
import {
  Avatar,
  KindMark,
  PriorityCell,
  ProgressBar,
  ScheduleChip,
  StackedBar,
  TaskStatusCell,
} from "@/components/task-ui";
import { formatCurrency, toNumber } from "@/lib/format";
import { driBand } from "@/lib/dri";
import {
  currentStage,
  isTaskOpen,
  isTaskOverdue,
  projectProgress,
  relativeDueLabel,
  scheduleHealth,
  startOfDayUTC,
  taskDueDate,
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  type Priority,
} from "@/lib/tasks";
import { isRequestOpen, isRequestOverdue } from "@/lib/requests";
import type {
  DashboardImpedimentRow,
  DashboardProjectRow,
  DashboardRequestRow,
  DashboardTaskRow,
} from "@/types/models";
import { projectVisibility } from "@/lib/visibility";
import { SpecialistDashboard } from "@/components/specialist-dashboard";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const PRIORITY_RANK: Record<Priority, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

const BAND_TONE = {
  low: "bg-st-done",
  watch: "bg-st-yellow",
  high: "bg-st-working",
  critical: "bg-st-stuck",
} as const;

const GROUP_TONES = [
  { text: "text-accent", bar: "bg-accent" },
  { text: "text-st-purple", bar: "bg-st-purple" },
  { text: "text-st-done", bar: "bg-st-done" },
  { text: "text-st-working", bar: "bg-st-working" },
  { text: "text-pr-medium", bar: "bg-pr-medium" },
];

/**
 * Painel — controle operacional da carteira.
 *
 * Só projetos ATIVOS entram: pausado e encerrado são histórico. Os filtros
 * de responsável, prioridade e busca são aplicados em memória sobre as
 * tarefas dos projetos ativos — suficiente para o volume do piloto; se a
 * carteira crescer, descem para o `where` do Prisma.
 */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ setor?: string; resp?: string; prio?: string; q?: string }>;
}) {
  const user = await requireUser("/");
  // Especialista tem painel próprio: seus projetos e o que faz nos dos outros.
  // Administrador e gerente seguem com o painel da carteira.
  if (user.role === "SPECIALIST") return <SpecialistDashboard user={user} />;
  const { setor, resp, prio, q } = await searchParams;
  const now = new Date();
  const manage = canManageProjects(user);

  // organizationId aqui é o que separa uma organização da outra no Painel —
  // sem ele, cada consulta abaixo (setores, pessoas, projetos e tudo que
  // pende de `projectWhere`) devolveria a carteira de todas as organizações.
  const projectWhere = {
    status: "ACTIVE" as const,
    AND: [projectVisibility(user)],
    ...(setor ? { sectorId: setor } : {}),
  };

  const [sectors, people, projects, tasks, impediments, requests]: [
    { id: string; name: string }[],
    { id: string; name: string }[],
    DashboardProjectRow[],
    DashboardTaskRow[],
    DashboardImpedimentRow[],
    DashboardRequestRow[],
  ] = await Promise.all([
    prisma.sector.findMany({
      where: { isActive: true, organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { isActive: true, organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: projectWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        cost: true,
        currency: true,
        startsAt: true,
        endsAt: true,
        clientRef: { select: { name: true } },
        sector: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        driScores: { where: { milestoneId: null }, orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
      },
    }),
    prisma.milestone.findMany({
      where: { project: projectWhere },
      include: {
        project: { select: { id: true, name: true, sectorId: true } },
        assignee: { select: { id: true, name: true } },
        driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
        _count: { select: { impediments: { where: { resolvedAt: null } } } },
      },
    }),
    prisma.impediment.findMany({
      where: { resolvedAt: null, milestone: { project: projectWhere } },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: {
        id: true,
        description: true,
        waitingOn: true,
        createdAt: true,
        owner: { select: { name: true } },
        milestone: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
    }),
    prisma.request.findMany({
      where: { status: "PENDING", project: projectWhere },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        description: true,
        type: true,
        waitingOn: true,
        dueAt: true,
        createdAt: true,
        owner: { select: { name: true } },
        project: { select: { id: true, name: true } },
        milestone: { select: { id: true, name: true } },
      },
    }),
  ]);

  /* ------------------------------ filtros ------------------------------ */

  const needle = q?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const minPriority = prio && prio in PRIORITY_RANK ? PRIORITY_RANK[prio as Priority] : null;
  const taskFilterOn = Boolean(resp || minPriority != null || needle);

  const filteredTasks = tasks.filter((t) => {
    if (resp && t.assignee?.id !== resp) return false;
    if (minPriority != null && PRIORITY_RANK[t.criticality] < minPriority) return false;
    if (needle && !`${t.name} ${t.project.name}`.toLocaleLowerCase("pt-BR").includes(needle)) return false;
    return true;
  });
  const filteredProjectIds = new Set(filteredTasks.map((t) => t.project.id));
  const visibleProjects = projects.filter(
    (p) =>
      !taskFilterOn ||
      filteredProjectIds.has(p.id) ||
      (resp && p.manager?.id === resp && minPriority == null && !needle) ||
      (needle && minPriority == null && !resp && p.name.toLocaleLowerCase("pt-BR").includes(needle)),
  );
  const visibleIds = new Set(visibleProjects.map((p) => p.id));
  const tasksByProject = new Map<string, DashboardTaskRow[]>();
  for (const t of tasks) {
    const list = tasksByProject.get(t.project.id) ?? [];
    list.push(t);
    tasksByProject.set(t.project.id, list);
  }

  /* -------------------------------- KPIs ------------------------------- */

  const openTasks = filteredTasks.filter(isTaskOpen);
  const inExecution = openTasks.filter((t) => t.status === "IN_PROGRESS" || t.status === "IN_REVIEW").length;
  const overdue = openTasks.filter((t) => isTaskOverdue(t, now));
  const overdueHigh = overdue.filter((t) => PRIORITY_RANK[t.criticality] >= 2).length;
  const alertProjects = visibleProjects.filter((p) => (p.driScores[0]?.score ?? 0) >= 55);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const doneThisMonth = filteredTasks.filter(
    (t) => t.status === "DONE" && t.actualDate && t.actualDate.getTime() >= monthStart.getTime(),
  );
  const visibleImpediments = impediments.filter((i) => visibleIds.has(i.milestone.project.id));
  const projectsWithImpediment = new Set(visibleImpediments.map((i) => i.milestone.project.id)).size;
  const visibleRequests = requests.filter((r) => isRequestOpen(r) && visibleIds.has(r.project.id));

  /* --------------------------- tarefas críticas ------------------------- */

  const scoreOf = (t: DashboardTaskRow) => t.driScores[0]?.score ?? 0;
  const today = startOfDayUTC(now).getTime();
  const critical = openTasks
    .filter((t) => {
      const due = taskDueDate(t);
      const soon = due ? (due.getTime() - today) / DAY <= 7 : false;
      return soon || scoreOf(t) >= 55 || t.status === "BLOCKED" || t.criticality === "CRITICAL";
    })
    .sort((a, b) => {
      const s = scoreOf(b) - scoreOf(a);
      if (Math.abs(s) >= 1) return s;
      return (taskDueDate(a)?.getTime() ?? Infinity) - (taskDueDate(b)?.getTime() ?? Infinity);
    });

  /* ----------------------------- carga e status ------------------------ */

  const load = new Map<string, { name: string | null; late: number; working: number; blocked: number; todo: number }>();
  for (const t of openTasks) {
    const key = t.assignee?.id ?? "__none";
    const row = load.get(key) ?? { name: t.assignee?.name ?? null, late: 0, working: 0, blocked: 0, todo: 0 };
    if (isTaskOverdue(t, now)) row.late += 1;
    else if (t.status === "BLOCKED") row.blocked += 1;
    else if (t.status === "IN_PROGRESS" || t.status === "IN_REVIEW") row.working += 1;
    else row.todo += 1;
    load.set(key, row);
  }
  const loadRows = [...load.entries()]
    .map(([id, r]) => ({ id, ...r, total: r.late + r.working + r.blocked + r.todo }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const maxLoad = Math.max(1, ...loadRows.map((r) => r.total));

  const statusCounts = TASK_STATUS_ORDER.map((s) => ({
    key: s,
    label: TASK_STATUS_LABEL[s],
    value: filteredTasks.filter((t) => t.status === s).length,
    className: TASK_STATUS_COLOR[s],
  }));

  /* ------------------------------- carteira ----------------------------- */

  const groups = new Map<string, { name: string; projects: DashboardProjectRow[] }>();
  for (const p of visibleProjects) {
    const key = p.sector?.id ?? "__none";
    const g = groups.get(key) ?? { name: p.sector?.name ?? "Sem setor", projects: [] };
    g.projects.push(p);
    groups.set(key, g);
  }
  const groupList = [...groups.values()].sort((a, b) =>
    a.name === "Sem setor" ? 1 : b.name === "Sem setor" ? -1 : a.name.localeCompare(b.name, "pt-BR"),
  );

  const ganttRows = visibleProjects
    .map((p) => {
      const list = tasksByProject.get(p.id) ?? [];
      const starts = list.map((t) => t.startDate ?? taskDueDate(t)).filter((d): d is Date => d != null);
      const ends = list.map((t) => t.actualDate ?? taskDueDate(t)).filter((d): d is Date => d != null);
      const start = p.startsAt ?? (starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null);
      const forecastEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;
      const score = p.driScores[0]?.score ?? 0;
      return {
        id: p.id,
        label: p.name,
        sublabel: p.sector?.name ?? null,
        href: `/projects/${p.id}`,
        start,
        // Término = o mais tarde entre o previsto no projeto e o que as tarefas
        // indicam; se as tarefas passaram do planejado, o risco preto marca a base.
        end:
          forecastEnd && p.endsAt
            ? new Date(Math.max(forecastEnd.getTime(), p.endsAt.getTime()))
            : forecastEnd ?? p.endsAt,
        baselineEnd: p.endsAt,
        progress: projectProgress(list),
        tone: BAND_TONE[driBand(score)],
        owner: p.manager?.name ?? null,
      };
    })
    .filter((r) => r.start || r.end)
    .sort((a, b) => (a.start ?? a.end!).getTime() - (b.start ?? b.end!).getTime())
    .slice(0, 15);

  const hasAnyProject = projects.length > 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------ cabeçalho ----------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            Onde a carteira vai travar — somente projetos ativos.
          </p>
        </div>
        {manage ? (
          <div className="flex flex-wrap items-center gap-2">
            <details className="relative">
              <summary className="list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-canvas">
                  <Plus size={15} /> Nova tarefa <ChevronDown size={14} />
                </span>
              </summary>
              <div className="absolute right-0 z-40 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
                <p className="px-2.5 py-1.5 text-xs text-ink-faint">Em qual projeto?</p>
                {projects.length === 0 ? (
                  <p className="px-2.5 py-2 text-sm text-ink-faint">Nenhum projeto ativo.</p>
                ) : (
                  projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}#nova-tarefa`}
                      className="block truncate rounded-md px-2.5 py-1.5 text-sm text-ink hover:bg-canvas"
                    >
                      {p.name}
                    </Link>
                  ))
                )}
              </div>
            </details>
            <Link href="/projects/new">
              <Button>
                <Plus size={15} /> Novo projeto
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      <DashboardFilters
        sectors={sectors.map((s) => ({ value: s.id, label: s.name }))}
        people={people.map((p) => ({ value: p.id, label: p.name }))}
      />

      {!hasAnyProject ? (
        <Empty>
          Nenhum projeto ativo{setor ? " neste setor" : ""}. Projetos pausados e
          encerrados não aparecem no Painel.
        </Empty>
      ) : (
        <>
          {/* --------------------------------- KPIs -------------------------------- */}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              tone="bg-st-working text-white"
              icon={<CircleDot size={20} />}
              label="Em andamento"
              value={visibleProjects.length}
              unit={visibleProjects.length === 1 ? "projeto" : "projetos"}
              hint={`${inExecution} tarefa(s) em execução`}
            />
            <KpiCard
              tone="bg-st-yellow text-ink"
              icon={<TriangleAlert size={20} />}
              label="Em alerta"
              value={alertProjects.length}
              unit="com DRI ≥ 55"
              hint={`${projectsWithImpediment} projeto(s) com impedimento aberto`}
            />
            <KpiCard
              tone="bg-st-stuck text-white"
              icon={<AlertCircle size={20} />}
              label="Atrasadas"
              value={overdue.length}
              unit={overdue.length === 1 ? "tarefa" : "tarefas"}
              hint={`${overdueHigh} de prioridade alta ou crítica`}
            />
            <KpiCard
              tone="bg-st-done text-white"
              icon={<CheckCircle2 size={20} />}
              label="Concluídas no mês"
              value={doneThisMonth.length}
              unit={doneThisMonth.length === 1 ? "entrega" : "entregas"}
              hint={`${doneThisMonth.filter((t) => t.kind === "MILESTONE").length} marco(s) atingido(s)`}
            />
          </section>

          {/* --------------------------- tarefas críticas -------------------------- */}
          <Panel
            icon={<Flame size={16} className="text-st-stuck" />}
            title="Tarefas críticas"
            hint="Vencem em 7 dias, atrasadas, impedidas, críticas ou com DRI ≥ 55 — ordenadas por DRI"
          >
            {critical.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">Nada crítico com os filtros atuais.</p>
            ) : (
              <div className="dp-scroll overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th className="min-w-[240px]">Tarefa</Th>
                      <Th className="min-w-[160px]">Projeto</Th>
                      <Th>Responsável</Th>
                      <Th className="w-[96px]">Prazo</Th>
                      <Th className="w-[104px]">Prioridade</Th>
                      <Th className="w-[128px]">Status</Th>
                      <Th className="w-[80px]">DRI</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {critical.slice(0, 10).map((t) => {
                      const late = isTaskOverdue(t, now);
                      const score = scoreOf(t);
                      return (
                        <tr key={t.id} className="border-t border-line hover:bg-canvas">
                          <Td className="max-w-[320px]">
                            <span className="flex items-center gap-2">
                              <KindMark kind={t.kind} />
                              <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="truncate hover:text-accent">
                                {t.name}
                              </Link>
                              {t._count.impediments > 0 ? (
                                <OctagonAlert size={14} className="shrink-0 text-st-stuck" aria-label="Com impedimento" />
                              ) : null}
                            </span>
                          </Td>
                          <Td className="max-w-[200px]">
                            <Link href={`/projects/${t.project.id}`} className="block truncate text-ink-soft hover:text-accent">
                              {t.project.name}
                            </Link>
                          </Td>
                          <Td className="text-center">
                            <span className="inline-flex justify-center">
                              <Avatar name={t.assignee?.name} />
                            </span>
                          </Td>
                          <Td className={clsx("text-center", late ? "font-medium text-st-stuck" : "text-ink-soft")}>
                            {relativeDueLabel(taskDueDate(t), now)}
                          </Td>
                          <td className="h-px border-r border-line p-0">
                            <PriorityCell value={t.criticality} fill />
                          </td>
                          <td className="h-px border-r border-line p-0">
                            <TaskStatusCell status={t.status} fill />
                          </td>
                          <Td className="text-center">
                            {score > 0 ? <DRIBadge score={score} showLabel={false} /> : <span className="text-ink-faint">—</span>}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {critical.length > 10 ? (
                  <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">
                    Mostrando 10 de {critical.length}. Use os filtros para refinar.
                  </p>
                ) : null}
              </div>
            )}
          </Panel>

          {/* ------------------------------- carteira ------------------------------ */}
          <section className="space-y-5">
            <h2 className="text-base font-semibold text-ink">Carteira de projetos</h2>
            {groupList.length === 0 ? (
              <Empty>Nenhum projeto corresponde aos filtros.</Empty>
            ) : (
              groupList.map((g, gi) => {
                const tone = GROUP_TONES[gi % GROUP_TONES.length];
                return (
                  <details key={g.name} open className="group">
                    <summary
                      className={clsx(
                        "mb-2 flex cursor-pointer list-none items-center gap-1.5 text-lg font-medium [&::-webkit-details-marker]:hidden",
                        tone.text,
                      )}
                    >
                      <ChevronDown size={18} className="-rotate-90 transition-transform group-open:rotate-0" />
                      {g.name}
                      <span className="ml-1 text-sm font-normal text-ink-faint">{g.projects.length}</span>
                    </summary>
                    <div className="dp-scroll relative overflow-x-auto">
                      <span aria-hidden className={clsx("absolute inset-y-0 left-0 w-1.5 rounded-l-md", tone.bar)} />
                      <table className="w-full border-collapse border-y border-r border-line">
                        <thead className="bg-surface">
                          <tr>
                            <Th className="min-w-[240px] pl-5">Projeto</Th>
                            <Th className="min-w-[160px]">Avanço</Th>
                            <Th className="min-w-[200px]">Etapa atual</Th>
                            <Th>Gerente</Th>
                            <Th className="w-[120px]">Cronograma</Th>
                            <Th className="w-[90px]">DRI</Th>
                            <Th align="right">Orçamento</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.projects.map((p) => {
                            const list = tasksByProject.get(p.id) ?? [];
                            const stage = currentStage(list);
                            const score = p.driScores[0]?.score;
                            return (
                              <tr key={p.id} className="border-b border-line hover:bg-canvas">
                                <Td className="max-w-[320px] pl-5">
                                  <Link href={`/projects/${p.id}`} className="block truncate text-ink hover:text-accent">
                                    {p.name}
                                  </Link>
                                  <p className="truncate text-xs text-ink-faint">
                                    {p.clientRef?.name ?? "Sem cliente"} · {list.length} tarefa(s)
                                  </p>
                                </Td>
                                <Td>
                                  <ProgressBar value={projectProgress(list)} />
                                </Td>
                                <Td className="max-w-[240px]">
                                  {stage ? (
                                    <Link
                                      href={`/projects/${p.id}/tasks/${stage.id}`}
                                      className="block truncate text-ink-soft hover:text-accent"
                                    >
                                      {stage.name}
                                    </Link>
                                  ) : (
                                    <span className="text-ink-faint">{list.length ? "Todas concluídas" : "Sem tarefas"}</span>
                                  )}
                                </Td>
                                <Td className="text-center">
                                  <span className="inline-flex items-center gap-2">
                                    <Avatar name={p.manager?.name} />
                                    {p.manager ? <span className="max-w-[110px] truncate text-ink-soft">{p.manager.name}</span> : null}
                                  </span>
                                </Td>
                                <Td className="text-center">
                                  <ScheduleChip health={scheduleHealth(list, now)} />
                                </Td>
                                <Td className="text-center">
                                  {score != null ? <DRIBadge score={score} showLabel={false} /> : <span className="text-ink-faint">—</span>}
                                </Td>
                                <Td align="right">{formatCurrency(toNumber(p.cost), p.currency)}</Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                );
              })
            )}
          </section>

          {/* ---------------------------- linha do tempo --------------------------- */}
          <Panel
            title="Linha do tempo da carteira"
            hint="Início → término previsto pelas tarefas · cor = faixa do DRI · parte escura = avanço"
          >
            <GanttChart
              rows={ganttRows}
              now={now}
              emptyText="Nenhum projeto com datas. Informe início/término no projeto ou nas tarefas."
            />
          </Panel>

          {/* ---------------------- carga, status e impedimentos -------------------- */}
          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Carga por pessoa" hint="Tarefas em aberto — não há horas cadastradas, então não é % de capacidade">
              {loadRows.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-faint">Nenhuma tarefa em aberto.</p>
              ) : (
                <ul className="space-y-3 px-4 py-4">
                  {loadRows.map((r) => (
                    <li key={r.id} className="flex items-center gap-3">
                      <Avatar name={r.name} size={26} />
                      <span className="w-32 shrink-0 truncate text-sm text-ink">{r.name ?? "Sem responsável"}</span>
                      <span className="flex-1">
                        <span className="block" style={{ width: `${(r.total / maxLoad) * 100}%` }}>
                          <StackedBar
                            height={14}
                            segments={[
                              { key: "late", label: "Atrasadas", value: r.late, className: "bg-st-stuck" },
                              { key: "blocked", label: "Impedidas", value: r.blocked, className: "bg-st-dark" },
                              { key: "working", label: "Em andamento", value: r.working, className: "bg-st-working" },
                              { key: "todo", label: "A fazer", value: r.todo, className: "bg-st-gray" },
                            ]}
                          />
                        </span>
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-soft">
                        {r.total} {r.late > 0 ? <span className="text-st-stuck">({r.late} atr.)</span> : null}
                      </span>
                    </li>
                  ))}
                  <li className="flex flex-wrap gap-3 pt-1 text-[11px] text-ink-faint">
                    <Legend className="bg-st-stuck" label="Atrasadas" />
                    <Legend className="bg-st-dark" label="Impedidas" />
                    <Legend className="bg-st-working" label="Em andamento / revisão" />
                    <Legend className="bg-st-gray" label="A fazer" />
                  </li>
                </ul>
              )}
            </Panel>

            <Panel title="Distribuição por status" hint={`${filteredTasks.length} tarefa(s) nos projetos ativos`}>
              <div className="space-y-4 px-4 py-4">
                <StackedBar segments={statusCounts} height={22} />
                <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                  {statusCounts.map((s) => (
                    <li key={s.key} className="flex items-center justify-between gap-2 text-sm">
                      <span className="inline-flex items-center gap-2 text-ink-soft">
                        <span className={clsx("h-2.5 w-2.5 rounded-sm", s.className)} />
                        {s.label}
                      </span>
                      <span className="tabular-nums text-ink">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
          </section>

          <Panel
            icon={<OctagonAlert size={16} className="text-st-stuck" />}
            title="Impedimentos ativos"
            hint="Mais antigos primeiro — bloqueio parado é o que vira atraso"
          >
            {visibleImpediments.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">
                Nenhum impedimento aberto. Registre na página da tarefa quando algo travar.
              </p>
            ) : (
              <div className="dp-scroll overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th className="min-w-[280px]">Impedimento</Th>
                      <Th className="min-w-[200px]">Tarefa</Th>
                      <Th>Depende de</Th>
                      <Th>Quem destrava</Th>
                      <Th align="right">Aberto há</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleImpediments.slice(0, 8).map((i) => {
                      const days = Math.floor((now.getTime() - i.createdAt.getTime()) / DAY);
                      return (
                        <tr key={i.id} className="border-t border-line hover:bg-canvas">
                          <Td className="max-w-[360px] whitespace-normal">{i.description}</Td>
                          <Td className="max-w-[240px]">
                            <Link
                              href={`/projects/${i.milestone.project.id}/tasks/${i.milestone.id}`}
                              className="block truncate hover:text-accent"
                            >
                              {i.milestone.name}
                            </Link>
                            <p className="truncate text-xs text-ink-faint">{i.milestone.project.name}</p>
                          </Td>
                          <Td className="text-ink-soft">{i.waitingOn ?? "—"}</Td>
                          <Td className="text-ink-soft">{i.owner?.name ?? "—"}</Td>
                          <Td align="right" className={days >= 7 ? "font-medium text-st-stuck" : "text-ink-soft"}>
                            {days} dia(s)
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            icon={<CircleDot size={16} className="text-st-working" />}
            title="Solicitações abertas"
            hint="Documento de referência, informação complementar — prazo mais próximo primeiro"
          >
            {visibleRequests.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-ink-faint">
                Nenhuma solicitação em aberto.
              </p>
            ) : (
              <div className="dp-scroll overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th className="min-w-[280px]">Solicitação</Th>
                      <Th className="min-w-[200px]">Projeto / Tarefa</Th>
                      <Th>Depende de</Th>
                      <Th>Quem cobra</Th>
                      <Th align="right">Prazo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRequests.slice(0, 8).map((r) => {
                      const late = isRequestOverdue(r, now);
                      return (
                        <tr key={r.id} className="border-t border-line hover:bg-canvas">
                          <Td className="max-w-[360px] whitespace-normal">
                            <Link href={`/projects/${r.project.id}/requests/${r.id}`} className="hover:text-accent">
                              {r.description}
                            </Link>
                            {r.type ? <span className="ml-1 text-xs text-ink-faint">({r.type})</span> : null}
                          </Td>
                          <Td className="max-w-[240px]">
                            {r.milestone ? (
                              <Link
                                href={`/projects/${r.project.id}/tasks/${r.milestone.id}`}
                                className="block truncate hover:text-accent"
                              >
                                {r.milestone.name}
                              </Link>
                            ) : (
                              <Link href={`/projects/${r.project.id}`} className="block truncate hover:text-accent">
                                {r.project.name}
                              </Link>
                            )}
                            <p className="truncate text-xs text-ink-faint">{r.project.name}</p>
                          </Td>
                          <Td className="text-ink-soft">{r.waitingOn ?? "—"}</Td>
                          <Td className="text-ink-soft">{r.owner?.name ?? "—"}</Td>
                          <Td align="right" className={late ? "font-medium text-st-stuck" : "text-ink-soft"}>
                            {r.dueAt ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(r.dueAt).replace(".", "") : "—"}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <details className="rounded-lg border border-line bg-surface px-4 py-3 text-xs text-ink-soft">
            <summary className="cursor-pointer text-sm font-medium text-ink">Legenda</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <p className="font-medium text-ink">Status da tarefa</p>
                {TASK_STATUS_ORDER.map((s) => (
                  <Legend key={s} className={TASK_STATUS_COLOR[s]} label={TASK_STATUS_LABEL[s]} />
                ))}
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-ink">Prioridade (escala separada)</p>
                <Legend className="bg-pr-low" label="Baixa" />
                <Legend className="bg-pr-medium" label="Média" />
                <Legend className="bg-pr-high" label="Alta" />
                <Legend className="bg-pr-critical" label="Crítica" />
              </div>
              <div className="space-y-1.5">
                <p className="font-medium text-ink">Cronograma</p>
                <p>Atrasado: alguma tarefa passou do prazo.</p>
                <p>Atenção: previsão deslizou, tarefa impedida ou vence em 7 dias com menos de 50% feito.</p>
                <p>DRI ≥ 55: restrição provável ou dominante.</p>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function KpiCard({
  tone,
  icon,
  label,
  value,
  unit,
  hint,
}: {
  tone: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  unit: string;
  hint: string;
}) {
  return (
    <div className={clsx("rounded-lg px-4 py-3.5", tone)}>
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
      <p className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        <span className="text-sm opacity-90">{unit}</span>
      </p>
      <p className="mt-0.5 text-xs opacity-90">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  hint,
  icon,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          {icon}
          {title}
        </h2>
        {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
