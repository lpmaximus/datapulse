import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createMilestone, recalculateNow } from "@/app/actions/projects";
import {
  Card,
  SectionTitle,
  DRIBadge,
  Bar,
  Button,
  Field,
  inputClass,
  Empty,
} from "@/components/ui";
import { DRITrendChart, type TrendPoint } from "@/components/dri-trend-chart";
import { formatCurrency, formatDate, formatDateTime, toNumber } from "@/lib/format";
import { BAND_LABEL, driBand } from "@/lib/dri";
import type { ProjectDetailRow, MilestoneWithScoreRow } from "@/types/models";

export const dynamic = "force-dynamic";

const CRITICALITY_LABEL: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const project: ProjectDetailRow | null = await prisma.project.findUnique({
    where: { id },
    include: {
      milestones: {
        orderBy: { createdAt: "asc" },
        include: {
          driScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
          _count: { select: { humanSignals: true, systemicSignals: true } },
        },
      },
      driScores: {
        where: { milestoneId: null },
        orderBy: { calculatedAt: "asc" },
        take: 60,
      },
    },
  });

  if (!project) notFound();

  const latest = project.driScores[project.driScores.length - 1];
  const projectScore = latest?.score ?? 0;

  const trend: TrendPoint[] = project.driScores.map((s) => ({
    date: formatDate(s.calculatedAt),
    score: Math.round(s.score * 10) / 10,
  }));

  // Ranking por restrição: o topo da lista é onde intervir primeiro.
  const ranked = project.milestones
    .map((m: MilestoneWithScoreRow) => ({ m, score: m.driScores[0]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const dominant = ranked[0];

  return (
    <div className="space-y-10">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/projects" className="text-xs text-ink-faint hover:text-ink-soft">
            ← Projetos
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {[project.client, project.sector].filter(Boolean).join(" · ") || "Sem cliente definido"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/projects/${project.id}/import`}>
            <Button variant="ghost">Importar planilha</Button>
          </Link>
          <form action={recalculateNow}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button variant="ghost" type="submit">Recalcular DRI</Button>
          </form>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase tracking-wider text-ink-soft">DRI do projeto</p>
          <div className="mt-3">
            <DRIBadge score={projectScore} />
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            {latest ? `Calculado em ${formatDateTime(latest.calculatedAt)}` : "Ainda não calculado"}
          </p>
        </Card>
        <Card className="sm:col-span-2">
          <p className="text-xs uppercase tracking-wider text-ink-soft">Restrição dominante</p>
          {dominant && dominant.score > 0 ? (
            <>
              <Link
                href={`/projects/${project.id}/milestones/${dominant.m.id}`}
                className="mt-2 block text-lg font-medium hover:text-accent"
              >
                {dominant.m.name}
              </Link>
              <p className="mt-1 text-sm text-ink-soft">
                {BAND_LABEL[driBand(dominant.score)]} · impacto econômico{" "}
                {formatCurrency(toNumber(dominant.m.economicImpact), project.currency)}
              </p>
              <div className="mt-3">
                <Bar value={dominant.score} />
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              Sem sinais suficientes. Importe uma planilha (Camada 1) ou colete
              avaliações (Camada 2) para o DRI ter o que ler.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle hint="Histórico do DRI do projeto">Tendência</SectionTitle>
        <Card>
          <DRITrendChart data={trend} />
        </Card>
      </section>

      <section>
        <SectionTitle hint="Ordenado por DRI — intervir de cima para baixo">
          Marcos críticos
        </SectionTitle>
        {ranked.length === 0 ? (
          <Empty>Nenhum marco cadastrado. Adicione abaixo ou importe uma planilha.</Empty>
        ) : (
          <ul className="space-y-2">
            {ranked.map(({ m, score }) => (
              <li key={m.id}>
                <Link href={`/projects/${project.id}/milestones/${m.id}`} className="block">
                  <Card className="transition hover:border-cyan-300">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{m.name}</p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {[
                            m.type,
                            `Criticidade ${CRITICALITY_LABEL[m.criticality]}`,
                            `Planejado ${formatDate(m.plannedDate)}`,
                            `${m._count.humanSignals} sinal(is) humano(s)`,
                            `${m._count.systemicSignals} sistêmico(s)`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <DRIBadge score={score} />
                    </div>
                    <div className="mt-3">
                      <Bar value={score} />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>Novo marco</SectionTitle>
        <Card>
          {error === "marco-invalido" ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              Informe ao menos o nome do marco.
            </p>
          ) : null}
          <form action={createMilestone} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="projectId" value={project.id} />
            <div className="sm:col-span-2">
              <Field label="Nome do marco">
                <input name="name" required className={inputClass} placeholder="Ex.: Liberação de projeto executivo" />
              </Field>
            </div>
            <Field label="Tipo">
              <input name="type" className={inputClass} placeholder="Engenharia, Suprimentos…" />
            </Field>
            <Field label="Criticidade técnica">
              <select name="criticality" defaultValue="MEDIUM" className={inputClass}>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="CRITICAL">Crítica</option>
              </select>
            </Field>
            <Field label="Impacto econômico" hint="Perda estimada se este marco falhar">
              <input name="economicImpact" inputMode="numeric" className={inputClass} placeholder="1500000" />
            </Field>
            <Field label="Data planejada">
              <input type="date" name="plannedDate" className={inputClass} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Adicionar marco</Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
