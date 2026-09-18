import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { hashRespondent } from "@/lib/auth";
import { Card, SectionTitle, Empty, DRIBadge, CriticalityChip } from "@/components/ui";
import { Th, Td } from "@/components/table-ui";
import { DocumentStatusChip, StuckBadge } from "@/components/document-status";
import { daysBetween } from "@/lib/documents";
import { formatDate, formatDateTime } from "@/lib/format";
import type {
  MyTaskRow,
  SignalRequestRow,
  DocumentTableRow,
  HumanSignalRow,
} from "@/types/models";
import { DOCUMENT_SELECT, currentRevision } from "@/components/document-table";
import { AlertTriangle, ClipboardCheck } from "lucide-react";
import { KindMark, PriorityCell, ProgressBar, TaskStatusCell } from "@/components/task-ui";
import { isTaskOverdue, relativeDueLabel, taskDueDate } from "@/lib/tasks";

export const dynamic = "force-dynamic";

function dueLabel(dueAt: Date | null, now: Date): { text: string; tone: string } {
  if (!dueAt) return { text: "sem prazo", tone: "text-ink-faint" };
  const days = Math.ceil((dueAt.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return { text: `atrasada há ${Math.abs(days)} dia(s)`, tone: "text-red-700" };
  if (days === 0) return { text: "vence hoje", tone: "text-orange-700" };
  if (days <= 3) return { text: `vence em ${days} dia(s)`, tone: "text-orange-700" };
  return { text: `vence em ${days} dia(s)`, tone: "text-ink-soft" };
}

export default async function MyWorkPage() {
  const user = await requireUser("/my-work");
  const now = new Date();

  const [pending, answered, memberships, myHash] = await Promise.all([
    prisma.signalRequest.findMany({
      // Projeto pausado/encerrado não cobra avaliação de ninguém.
      where: { assigneeId: user.id, status: "PENDING", milestone: { project: { status: "ACTIVE" } } },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        dueAt: true,
        note: true,
        createdAt: true,
        answeredAt: true,
        milestone: {
          select: {
            id: true,
            name: true,
            criticality: true,
            plannedDate: true,
            project: { select: { id: true, name: true } },
            driScores: {
              orderBy: { calculatedAt: "desc" },
              take: 1,
              select: { score: true },
            },
          },
        },
      },
    }),
    prisma.signalRequest.findMany({
      where: { assigneeId: user.id, status: "ANSWERED" },
      orderBy: { answeredAt: "desc" },
      take: 20,
      select: {
        id: true,
        status: true,
        dueAt: true,
        note: true,
        createdAt: true,
        answeredAt: true,
        milestone: {
          select: {
            id: true,
            name: true,
            criticality: true,
            plannedDate: true,
            project: { select: { id: true, name: true } },
            driScores: {
              orderBy: { calculatedAt: "desc" },
              take: 1,
              select: { score: true },
            },
          },
        },
      },
    }),
    prisma.projectMember.findMany({
      where: { userId: user.id, project: { status: "ACTIVE" } },
      select: { projectId: true },
    }),
    Promise.resolve(hashRespondent(user.id)),
  ]);

  const myTasks: MyTaskRow[] = await prisma.milestone.findMany({
    where: {
      assigneeId: user.id,
      status: { not: "DONE" },
      project: { status: "ACTIVE" },
    },
    orderBy: [{ forecastDate: "asc" }, { plannedDate: "asc" }],
    take: 50,
    include: {
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
    },
  });

  const projectIds = memberships.map((m: { projectId: string }) => m.projectId);

  // As próprias respostas — visíveis só para quem as escreveu, via o mesmo
  // pseudônimo usado na gravação.
  const myAnswers: HumanSignalRow[] = await prisma.humanSignal.findMany({
    where: { respondentHash: myHash },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      respondentRole: true,
      failureProbability: true,
      planConfidence: true,
      perceivedBottleneck: true,
      blockedDecision: true,
      createdAt: true,
    },
  });

  const myDocuments: DocumentTableRow[] =
    projectIds.length > 0
      ? await prisma.document.findMany({
          where: {
            projectId: { in: projectIds },
            revisions: { some: { status: { in: ["DRAFT", "IN_REVIEW", "REJECTED"] } } },
          },
          orderBy: { updatedAt: "desc" },
          take: 25,
          select: DOCUMENT_SELECT,
        })
      : [];

  const overdue = pending.filter(
    (r: SignalRequestRow) => r.dueAt && r.dueAt.getTime() < now.getTime(),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas demandas</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {user.name}
          {user.functionName ? ` · ${user.functionName}` : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Minhas tarefas abertas</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{myTasks.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            Avaliações pendentes
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">{pending.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">Avaliações atrasadas</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-red-600">
            {overdue.length}
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-faint">
            Documentos abertos nos meus projetos
          </p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {myDocuments.length}
          </p>
        </Card>
      </div>

      <section>
        <SectionTitle hint="Tarefas em que você é o responsável, por prazo">Minhas tarefas</SectionTitle>
        {myTasks.length === 0 ? (
          <Empty>Nenhuma tarefa aberta sob sua responsabilidade.</Empty>
        ) : (
          <Card className="dp-scroll overflow-x-auto p-0">
            <table className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="min-w-[240px]">Tarefa</Th>
                  <Th className="min-w-[160px]">Projeto</Th>
                  <Th className="w-[130px]">Status</Th>
                  <Th className="w-[100px]">Prioridade</Th>
                  <Th className="min-w-[140px]">Avanço</Th>
                  <Th>Prazo</Th>
                </tr>
              </thead>
              <tbody>
                {myTasks.map((t) => {
                  const late = isTaskOverdue(t, now);
                  return (
                    <tr key={t.id} className="border-b border-line last:border-0 hover:bg-canvas">
                      <Td>
                        <span className="flex items-center gap-2">
                          <KindMark kind={t.kind} />
                          <Link href={`/projects/${t.project.id}/tasks/${t.id}`} className="hover:text-accent">
                            {t.name}
                          </Link>
                        </span>
                      </Td>
                      <Td className="text-ink-soft">{t.project.name}</Td>
                      <td className="h-px border-r border-line p-0">
                        <TaskStatusCell status={t.status} fill />
                      </td>
                      <td className="h-px border-r border-line p-0">
                        <PriorityCell value={t.criticality} fill />
                      </td>
                      <Td>{t.kind === "MILESTONE" ? <span className="text-xs text-ink-faint">marco</span> : <ProgressBar value={t.progress} />}</Td>
                      <Td className={late ? "font-medium text-st-stuck" : "text-ink-soft"}>
                        {relativeDueLabel(taskDueDate(t), now)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <SectionTitle hint="Ordenadas por urgência">
          Avaliações que aguardam você
        </SectionTitle>

        {pending.length === 0 ? (
          <Empty>
            Nenhuma avaliação pendente. Quando um gerente convocar você para uma
            tarefa, ela aparece aqui.
          </Empty>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="min-w-[220px]">Tarefa</Th>
                  <Th className="min-w-[160px]">Projeto</Th>
                  <Th>Criticidade</Th>
                  <Th>DRI atual</Th>
                  <Th>Prazo</Th>
                  <Th className="min-w-[200px]">Pedido do gestor</Th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r: SignalRequestRow) => {
                  const due = dueLabel(r.dueAt, now);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line last:border-0 hover:bg-canvas/60"
                    >
                      <Td className="max-w-[260px]">
                        <Link
                          href={`/projects/${r.milestone.project.id}/tasks/${r.milestone.id}`}
                          className="font-medium text-ink hover:text-accent"
                        >
                          {r.milestone.name}
                        </Link>
                        <p className="text-xs text-ink-faint">
                          planejado {formatDate(r.milestone.plannedDate)}
                        </p>
                      </Td>
                      <Td className="text-ink-soft">{r.milestone.project.name}</Td>
                      <Td>
                        <CriticalityChip value={r.milestone.criticality} />
                      </Td>
                      <Td>
                        {r.milestone.driScores[0] ? (
                          <DRIBadge
                            score={r.milestone.driScores[0].score}
                            showLabel={false}
                          />
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </Td>
                      <Td className={due.tone}>{due.text}</Td>
                      <Td className="max-w-[260px] truncate text-ink-soft">
                        {r.note ?? "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint={`${myAnswers.length} registro(s)`}>
            Minhas respostas
          </SectionTitle>
          {myAnswers.length === 0 ? (
            <Empty>Você ainda não registrou nenhuma avaliação.</Empty>
          ) : (
            <Card className="divide-y divide-line p-0">
              {myAnswers.map((s) => (
                <div key={s.id} className="px-5 py-3">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">
                      {s.failureProbability}% de falha · confiança {s.planConfidence}/5
                    </span>
                    <span className="text-xs text-ink-faint">
                      {formatDateTime(s.createdAt)}
                    </span>
                  </div>
                  {s.perceivedBottleneck ? (
                    <p className="mt-1 text-sm text-ink-soft">
                      &ldquo;{s.perceivedBottleneck}&rdquo;
                    </p>
                  ) : null}
                </div>
              ))}
              <p className="px-5 py-3 text-xs text-ink-faint">
                Só você enxerga esta lista. Para os gestores, suas respostas
                aparecem agregadas ao DRI, sem identificação nominal.
              </p>
            </Card>
          )}
        </div>

        <div>
          <SectionTitle hint="Últimas 20 respondidas">
            DRI das tarefas que avaliei
          </SectionTitle>
          {answered.length === 0 ? (
            <Empty>Nada respondido ainda.</Empty>
          ) : (
            <Card className="divide-y divide-line p-0">
              {answered.map((r: SignalRequestRow) => (
                <Link
                  key={r.id}
                  href={`/projects/${r.milestone.project.id}/tasks/${r.milestone.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-canvas/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.milestone.name}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {r.milestone.project.name}
                      {r.answeredAt ? ` · respondido em ${formatDate(r.answeredAt)}` : ""}
                    </p>
                  </div>
                  {r.milestone.driScores[0] ? (
                    <DRIBadge score={r.milestone.driScores[0].score} showLabel={false} />
                  ) : (
                    <span className="text-xs text-ink-faint">sem DRI</span>
                  )}
                </Link>
              ))}
            </Card>
          )}
        </div>
      </section>

      <section>
        <SectionTitle hint="Projetos em que você está alocado">
          Documentos que podem embasar sua avaliação
        </SectionTitle>

        {projectIds.length === 0 ? (
          <Empty>
            Você não está alocado a nenhum projeto. Peça ao gerente para incluir
            você na equipe.
          </Empty>
        ) : myDocuments.length === 0 ? (
          <Empty>Nenhum documento em aberto nos seus projetos.</Empty>
        ) : (
          <Card className="overflow-hidden p-0">
            <table className="w-full border-collapse">
              <thead className="bg-surface">
                <tr>
                  <Th className="min-w-[240px]">Documento</Th>
                  <Th className="min-w-[160px]">Projeto</Th>
                  <Th>Status</Th>
                  <Th align="right">Revisões</Th>
                  <Th>Prazo</Th>
                </tr>
              </thead>
              <tbody>
                {myDocuments.map((d) => (
                  <tr
                    key={d.id}
                    className="border-b border-line last:border-0 hover:bg-canvas/60"
                  >
                    <Td className="max-w-[280px]">
                      <Link
                        href={`/documents/${d.id}`}
                        className="font-medium text-ink hover:text-accent"
                      >
                        {d.number ? (
                          <span className="text-ink-faint">{d.number} · </span>
                        ) : null}
                        {d.name}
                      </Link>
                    </Td>
                    <Td className="text-ink-soft">{d.project.name}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {currentRevision(d) ? (
                          <DocumentStatusChip status={currentRevision(d)!.status} />
                        ) : (
                          "—"
                        )}
                        <StuckBadge
                          days={
                            currentRevision(d)?.status === "IN_REVIEW"
                              ? daysBetween(now, currentRevision(d)!.inReviewSince)
                              : null
                          }
                        />
                      </div>
                    </Td>
                    <Td align="right">{d.revisions.length}</Td>
                    <Td className="text-ink-faint">
                      {formatDate(currentRevision(d)?.dueAt ?? null)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {overdue.length > 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {overdue.length} avaliação(ões) com prazo vencido. Silêncio prolongado
          é lido pelo DRI como sinal de risco — responder, mesmo que para dizer
          &ldquo;sem novidades&rdquo;, melhora a leitura.
        </p>
      ) : (
        <p className="flex items-start gap-2 text-xs text-ink-faint">
          <ClipboardCheck size={14} className="mt-0.5 shrink-0" />
          Suas avaliações alimentam a Camada 2 do DRI.
        </p>
      )}
    </div>
  );
}
