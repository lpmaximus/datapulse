import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { Card, DRIBadge, Empty, SectionTitle } from "@/components/ui";
import { ResizableTable, Td, Th } from "@/components/table-ui";
import { PriorityCell, TaskStatusCell } from "@/components/task-ui";
import { calendarDay } from "@/lib/business-days";
import { formatDate } from "@/lib/format";
import { isRequestOverdue } from "@/lib/requests";
import { isTaskOverdue, relativeDueLabel, startOfDayUTC, taskDueDate } from "@/lib/tasks";
import {
  DAILY_CAPACITY_HOURS,
  WEEK_CAPACITY_HOURS,
  effectiveHours,
  formatHours,
  isoDay,
  resolveWeek,
  summarizeDay,
  weekDays,
} from "@/lib/timesheet";

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "alert";
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <p
        className={
          "mt-2 text-3xl font-semibold tabular-nums " +
          (tone === "alert" && Number(value) > 0 ? "text-red-600" : "")
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-ink-faint">{hint}</p> : null}
    </Card>
  );
}

/**
 * Painel do especialista: o que ele coordena (seus projetos) e o que faz para
 * os outros (tarefas, análises e solicitações em projetos de terceiros).
 *
 * "Projeto dele" = ele é o gerente. Em projeto de terceiros, só entra o que
 * é dele (decisão de 21/09/2026): sem resumo nem DRI do projeto do colega.
 */
export async function SpecialistDashboard({ user }: { user: SessionUser }) {
  const now = new Date();
  const today = startOfDayUTC(now);
  const orgActive = { status: "ACTIVE" as const, organizationId: user.organizationId };
  // Projeto de terceiros: outro gerente, ou nenhum. `NOT` deixaria de fora o
  // projeto sem gerente (NULL != id não é verdadeiro no SQL).
  const thirdParty = {
    ...orgActive,
    OR: [{ managerId: null }, { managerId: { not: user.id } }],
  };
  const week = resolveWeek(undefined, now);

  const [own, myTasks, myRevisions, myRequests, pendingDelegations, hours] = await Promise.all([
    prisma.project.findMany({
      where: { ...orgActive, managerId: user.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        endsAt: true,
        sector: { select: { name: true } },
        driScores: { where: { milestoneId: null }, orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
        milestones: {
          where: { status: { notIn: ["DONE", "CANCELLED"] } },
          select: {
            status: true,
            plannedDate: true,
            forecastDate: true,
            actualDate: true,
            _count: { select: { impediments: { where: { resolvedAt: null } } } },
          },
        },
        documents: {
          select: {
            revisions: {
              where: { status: "IN_REVIEW" },
              select: { dueAt: true },
            },
          },
        },
      },
    }),
    prisma.milestone.findMany({
      where: {
        assigneeId: user.id,
        status: { notIn: ["DONE", "CANCELLED"] },
        project: thirdParty,
      },
      orderBy: [{ forecastDate: "asc" }, { plannedDate: "asc" }],
      take: 50,
      select: {
        id: true,
        name: true,
        status: true,
        criticality: true,
        plannedDate: true,
        forecastDate: true,
        actualDate: true,
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.documentRevision.findMany({
      where: {
        status: "IN_REVIEW",
        // Quem está com a análise: o designado ou, sem designado, o responsável.
        OR: [{ specialistId: user.id }, { specialistId: null, document: { responsibleId: user.id } }],
        document: { project: thirdParty },
      },
      orderBy: [{ dueAt: "asc" }, { inReviewSince: "asc" }],
      take: 50,
      select: {
        id: true,
        name: true,
        dueAt: true,
        document: {
          select: { id: true, number: true, name: true, project: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.request.findMany({
      where: { ownerId: user.id, status: "PENDING", project: thirdParty },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        description: true,
        dueAt: true,
        status: true,
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.analysisDelegation.count({
      where: {
        toUserId: user.id,
        status: "PENDING",
        revision: { document: { project: orgActive } },
      },
    }),
    prisma.timeEntry.findMany({
      where: { userId: user.id, date: { gte: week, lte: weekDays(week)[4] } },
      select: { date: true, plannedHours: true, actualHours: true },
    }),
  ]);

  /* ------------------------- meus projetos (gerente) ------------------------ */
  const ownRows = own.map((p) => {
    const open = p.milestones.length;
    const late = p.milestones.filter((m) => isTaskOverdue(m, now)).length;
    const blocked = p.milestones.reduce((s, m) => s + m._count.impediments, 0);
    const inReview = p.documents.flatMap((d) => d.revisions);
    const reviewLate = inReview.filter((r) => r.dueAt && startOfDayUTC(r.dueAt).getTime() < today.getTime()).length;
    return {
      id: p.id,
      name: p.name,
      sector: p.sector?.name ?? null,
      endsAt: p.endsAt,
      dri: p.driScores[0]?.score ?? null,
      open,
      late,
      blocked,
      inReview: inReview.length,
      reviewLate,
    };
  });

  /* ----------------------- minhas atividades (terceiros) --------------------- */
  const lateTasks = myTasks.filter((t) => isTaskOverdue(t, now)).length;
  const lateRevisions = myRevisions.filter(
    (r) => r.dueAt && startOfDayUTC(r.dueAt).getTime() < today.getTime(),
  ).length;
  const lateRequests = myRequests.filter((r) => isRequestOverdue(r, now)).length;

  /* ------------------------------ horas da semana ---------------------------- */
  const entries = hours.map((h) => ({
    date: h.date,
    plannedHours: Number(h.plannedHours),
    actualHours: h.actualHours == null ? null : Number(h.actualHours),
  }));
  const days = weekDays(week);
  const weekEffective = entries.reduce((s, e) => s + effectiveHours(e), 0);
  const weekPct = Math.round((weekEffective / WEEK_CAPACITY_HOURS) * 1000) / 10;
  const todayKey = isoDay(calendarDay(now));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="mt-0.5 text-sm text-ink-soft">
            {user.name}
            {user.functionName ? ` · ${user.functionName}` : ""} — seus projetos e o que você faz nos dos outros.
          </p>
        </div>
        <Link
          href="/hours"
          className="rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
        >
          Lançar horas
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Projetos que coordeno" value={ownRows.length} />
        <Kpi label="Tarefas em projetos de terceiros" value={myTasks.length} hint={`${lateTasks} atrasada(s)`} />
        <Kpi label="Análises com você" value={myRevisions.length} tone="alert" hint={`${lateRevisions} vencida(s)`} />
        <Kpi label="Delegações a responder" value={pendingDelegations} hint="em Minhas demandas" />
        <Kpi
          label="Horas da semana"
          value={`${String(weekPct).replace(".", ",")}%`}
          hint={`${formatHours(weekEffective)} de ${formatHours(WEEK_CAPACITY_HOURS)}`}
        />
      </div>

      {/* ------------------------------- meus projetos ------------------------------ */}
      <section>
        <SectionTitle hint="Projetos ativos em que você é o gerente">Meus projetos</SectionTitle>
        {ownRows.length === 0 ? (
          <Empty>Você não é gerente de nenhum projeto ativo.</Empty>
        ) : (
          <Card className="dp-scroll overflow-x-auto p-0">
            <ResizableTable id="specialist-own-projects" className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="min-w-[220px]">Projeto</Th>
                  <Th>DRI</Th>
                  <Th align="right">Tarefas abertas</Th>
                  <Th align="right">Atrasadas</Th>
                  <Th align="right">Impedimentos</Th>
                  <Th align="right">Em análise</Th>
                  <Th align="right">Análises vencidas</Th>
                  <Th>Término</Th>
                </tr>
              </thead>
              <tbody>
                {ownRows.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <Td>
                      <Link href={`/projects/${p.id}`} className="font-medium hover:text-accent">
                        {p.name}
                      </Link>
                      {p.sector ? <p className="text-xs text-ink-faint">{p.sector}</p> : null}
                    </Td>
                    <Td>{p.dri != null ? <DRIBadge score={p.dri} showLabel={false} /> : <span className="text-ink-faint">—</span>}</Td>
                    <Td align="right">{p.open}</Td>
                    <Td align="right" className={p.late > 0 ? "font-medium text-st-stuck" : ""}>{p.late}</Td>
                    <Td align="right" className={p.blocked > 0 ? "font-medium text-st-stuck" : ""}>{p.blocked}</Td>
                    <Td align="right">{p.inReview}</Td>
                    <Td align="right" className={p.reviewLate > 0 ? "font-medium text-st-stuck" : ""}>{p.reviewLate}</Td>
                    <Td className="text-ink-soft">{formatDate(p.endsAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </ResizableTable>
          </Card>
        )}
      </section>

      {/* ------------------------- atividades em projetos de terceiros ------------------------- */}
      <section className="space-y-6">
        <SectionTitle hint="Só o que é seu, em projetos de outros gerentes">
          Minhas atividades em projetos de terceiros
        </SectionTitle>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Análises com você</p>
          {myRevisions.length === 0 ? (
            <Empty>Nenhuma revisão aguardando sua análise.</Empty>
          ) : (
            <Card className="dp-scroll overflow-x-auto p-0">
              <ResizableTable id="specialist-third-party-reviews" className="w-full border-collapse">
                <thead className="bg-surface">
                  <tr>
                    <Th className="min-w-[260px]">Documento</Th>
                    <Th>Revisão</Th>
                    <Th className="min-w-[160px]">Projeto</Th>
                    <Th>Vencimento</Th>
                  </tr>
                </thead>
                <tbody>
                  {myRevisions.map((r) => {
                    const late = r.dueAt != null && startOfDayUTC(r.dueAt).getTime() < today.getTime();
                    return (
                      <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                        <Td>
                          <Link href={`/documents/${r.document.id}`} className="hover:text-accent">
                            {r.document.number ? `${r.document.number} — ` : ""}
                            {r.document.name}
                          </Link>
                        </Td>
                        <Td className="text-ink-soft">{r.name}</Td>
                        <Td className="text-ink-soft">{r.document.project.name}</Td>
                        <Td className={late ? "font-medium text-st-stuck" : "text-ink-soft"}>
                          {relativeDueLabel(r.dueAt, now)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResizableTable>
            </Card>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Tarefas</p>
          {myTasks.length === 0 ? (
            <Empty>Nenhuma tarefa sua em projetos de terceiros.</Empty>
          ) : (
            <Card className="dp-scroll overflow-x-auto p-0">
              <ResizableTable id="specialist-third-party-tasks" className="w-full border-collapse">
                <thead className="bg-surface">
                  <tr>
                    <Th className="min-w-[240px]">Tarefa</Th>
                    <Th className="min-w-[160px]">Projeto</Th>
                    <Th className="w-[130px]">Status</Th>
                    <Th className="w-[100px]">Prioridade</Th>
                    <Th>Prazo</Th>
                  </tr>
                </thead>
                <tbody>
                  {myTasks.map((t) => {
                    const late = isTaskOverdue(t, now);
                    return (
                      <tr key={t.id} className="border-b border-line last:border-0 hover:bg-canvas">
                        <Td>
                          <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="hover:text-accent">
                            {t.name}
                          </Link>
                        </Td>
                        <Td className="text-ink-soft">{t.project.name}</Td>
                        <td className="h-px border-r border-line p-0">
                          <TaskStatusCell status={t.status} fill />
                        </td>
                        <td className="h-px border-r border-line p-0">
                          <PriorityCell value={t.criticality} fill />
                        </td>
                        <Td className={late ? "font-medium text-st-stuck" : "text-ink-soft"}>
                          {relativeDueLabel(taskDueDate(t), now)}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </ResizableTable>
            </Card>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-ink">Solicitações pendentes com você</p>
          {myRequests.length === 0 ? (
            <Empty>Nenhuma solicitação pendente com você.</Empty>
          ) : (
            <Card className="divide-y divide-line p-0">
              {myRequests.map((r) => (
                <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                  <Link
                    href={`/projects/${r.project.id}/requests/${r.id}`}
                    className="text-sm text-ink hover:text-accent"
                  >
                    {r.description}
                  </Link>
                  <span className="text-xs text-ink-faint">
                    {r.project.name} ·{" "}
                    <span className={isRequestOverdue(r, now) ? "font-medium text-st-stuck" : ""}>
                      {r.dueAt ? relativeDueLabel(r.dueAt, now) : "sem prazo"}
                    </span>
                  </span>
                </div>
              ))}
              {lateRequests > 0 ? (
                <p className="px-5 py-2 text-xs text-st-stuck">{lateRequests} atrasada(s).</p>
              ) : null}
            </Card>
          )}
        </div>
      </section>

      {/* -------------------------------- horas da semana ------------------------------- */}
      <section>
        <SectionTitle hint={`Capacidade de ${DAILY_CAPACITY_HOURS} h por dia útil`}>
          Minhas horas na semana
        </SectionTitle>
        <Card>
          <div className="grid grid-cols-5 gap-3">
            {days.map((day) => {
              const key = isoDay(day);
              const sum = summarizeDay(entries.filter((e) => isoDay(e.date) === key));
              return (
                <Link
                  key={key}
                  href={`/hours?semana=${key}`}
                  className={
                    "rounded-md border px-3 py-2 hover:bg-canvas " +
                    (key === todayKey ? "border-accent" : "border-line")
                  }
                >
                  <p className="text-xs text-ink-faint">
                    {WEEKDAY[day.getUTCDay()]} {String(day.getUTCDate()).padStart(2, "0")}
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {formatHours(sum.effective)}
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={sum.over ? "h-full bg-red-500" : "h-full bg-accent"}
                      style={{ width: `${Math.min(100, sum.pct)}%` }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
