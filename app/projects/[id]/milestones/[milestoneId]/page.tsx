import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, SectionTitle, DRIBadge, Empty } from "@/components/ui";
import { HumanSignalForm } from "@/components/human-signal-form";
import { DRITrendChart, type TrendPoint } from "@/components/dri-trend-chart";
import { formatCurrency, formatDate, formatDateTime, toNumber } from "@/lib/format";
import type { MilestoneDetailRow } from "@/types/models";

export const dynamic = "force-dynamic";

export default async function MilestonePage({
  params,
}: {
  params: Promise<{ id: string; milestoneId: string }>;
}) {
  const { id, milestoneId } = await params;

  const milestone: MilestoneDetailRow | null = await prisma.milestone.findFirst({
    where: { id: milestoneId, projectId: id },
    include: {
      project: true,
      driScores: { orderBy: { calculatedAt: "asc" }, take: 60 },
      humanSignals: { orderBy: { createdAt: "desc" }, take: 20 },
      systemicSignals: { orderBy: { referenceDate: "desc" }, take: 10 },
    },
  });

  if (!milestone) notFound();

  const latest = milestone.driScores[milestone.driScores.length - 1];
  const breakdown = (latest?.breakdown ?? {}) as Record<string, unknown>;
  const confidence = typeof breakdown.confidence === "number" ? breakdown.confidence : null;

  const trend: TrendPoint[] = milestone.driScores.map((s) => ({
    date: formatDate(s.calculatedAt),
    score: Math.round(s.score * 10) / 10,
  }));

  return (
    <div className="space-y-10">
      <section>
        <Link href={`/projects/${id}`} className="text-xs text-ink-faint hover:text-ink-soft">
          ← {milestone.project.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{milestone.name}</h1>
          <DRIBadge score={latest?.score ?? 0} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          Planejado {formatDate(milestone.plannedDate)} · Realizado{" "}
          {formatDate(milestone.actualDate)} · Impacto{" "}
          {formatCurrency(toNumber(milestone.economicImpact), milestone.project.currency)}
          {confidence != null
            ? ` · Confiança do cálculo ${Math.round(confidence * 100)}%`
            : ""}
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle hint="Camada 2">Registrar avaliação</SectionTitle>
          <Card>
            <HumanSignalForm milestoneId={milestone.id} />
          </Card>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle>Tendência do marco</SectionTitle>
            <Card>
              <DRITrendChart data={trend} />
            </Card>
          </div>

          <div>
            <SectionTitle hint={`${milestone.humanSignals.length} registro(s)`}>
              Sinais humanos recentes
            </SectionTitle>
            {milestone.humanSignals.length === 0 ? (
              <Empty>Nenhuma avaliação ainda.</Empty>
            ) : (
              <ul className="space-y-2">
                {milestone.humanSignals.map((s) => (
                  <li key={s.id}>
                    <Card className="p-4">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {s.failureProbability}% de falha · confiança {s.planConfidence}/5
                        </span>
                        <span className="text-xs text-ink-soft">
                          {formatDateTime(s.createdAt)}
                        </span>
                      </div>
                      {s.perceivedBottleneck ? (
                        <p className="mt-2 text-sm text-ink">
                          &ldquo;{s.perceivedBottleneck}&rdquo;
                        </p>
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
            {milestone.systemicSignals.length === 0 ? (
              <Empty>Nenhum dado importado para este marco.</Empty>
            ) : (
              <ul className="space-y-2">
                {milestone.systemicSignals.map((s) => (
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
                        Custo previsto{" "}
                        {formatCurrency(toNumber(s.plannedCost), milestone.project.currency)} ·
                        realizado{" "}
                        {formatCurrency(toNumber(s.actualCost), milestone.project.currency)}
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
