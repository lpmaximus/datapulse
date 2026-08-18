import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, DRIBadge, Button, Empty } from "@/components/ui";
import { formatCurrency, toNumber } from "@/lib/format";
import { driBand } from "@/lib/dri";
import type { OverviewMilestoneRow, OverviewProjectRow } from "@/types/models";
import { ArrowRight, TrendingUp } from "lucide-react";

export const dynamic = "force-dynamic";

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-soft">{hint}</p> : null}
    </Card>
  );
}

export default async function PainelPage() {
  const [projects, milestones]: [OverviewProjectRow[], OverviewMilestoneRow[]] =
    await Promise.all([
      prisma.project.findMany({
        select: {
          id: true,
          status: true,
          driScores: {
            where: { milestoneId: null },
            orderBy: { calculatedAt: "desc" },
            take: 1,
            select: { score: true },
          },
        },
      }),
      prisma.milestone.findMany({
        include: {
          project: { select: { id: true, name: true, currency: true, status: true } },
          driScores: { orderBy: { calculatedAt: "desc" }, take: 1, select: { score: true } },
          _count: { select: { humanSignals: true, systemicSignals: true } },
        },
      }),
    ]);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const scored = projects.filter((p) => p.driScores.length > 0);
  const avgDri =
    scored.length > 0
      ? scored.reduce((a, p) => a + p.driScores[0].score, 0) / scored.length
      : 0;

  const criticalMilestones = milestones.filter(
    (m) => driBand(m.driScores[0]?.score ?? 0) === "critical",
  );
  const noDataMilestones = milestones.filter(
    (m) => m._count.humanSignals === 0 && m._count.systemicSignals === 0,
  );

  const attention = milestones
    .filter((m) => (m.driScores[0]?.score ?? 0) > 0 && !m.actualDate)
    .sort((a, b) => (b.driScores[0]?.score ?? 0) - (a.driScores[0]?.score ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Onde a carteira de projetos tende a travar, hoje.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Projetos ativos"
          value={String(activeProjects.length)}
          hint={`${projects.length} no total`}
        />
        <Kpi
          label="DRI médio da carteira"
          value={scored.length > 0 ? avgDri.toFixed(1) : "—"}
          hint={scored.length > 0 ? `${scored.length} projeto(s) com dado` : "Sem cálculo ainda"}
        />
        <Kpi
          label="Marcos em zona crítica"
          value={String(criticalMilestones.length)}
          hint="DRI ≥ 75"
        />
        <Kpi
          label="Marcos sem sinais"
          value={String(noDataMilestones.length)}
          hint="Nenhuma camada alimentada"
        />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-ink-soft">
            <TrendingUp size={15} />
            Atenção — maiores restrições ativas
          </h2>
          <Link
            href="/milestones"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong"
          >
            Ver todos os marcos
            <ArrowRight size={13} />
          </Link>
        </div>

        {attention.length === 0 ? (
          <Empty>
            Nenhum marco com DRI calculado ainda. Importe uma planilha ou colete a
            primeira avaliação em um projeto.
          </Empty>
        ) : (
          <Card className="divide-y divide-line p-0">
            {attention.map((m) => (
              <Link
                key={m.id}
                href={`/projects/${m.project.id}/milestones/${m.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-canvas/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{m.name}</p>
                  <p className="truncate text-xs text-ink-faint">
                    {m.project.name}
                    {m.economicImpact
                      ? ` · impacto ${formatCurrency(toNumber(m.economicImpact), m.project.currency)}`
                      : ""}
                  </p>
                </div>
                <DRIBadge score={m.driScores[0]?.score ?? 0} />
              </Link>
            ))}
          </Card>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/projects/new">
          <Button>Novo projeto</Button>
        </Link>
        <Link href="/projects">
          <Button variant="outline">Ver carteira de projetos</Button>
        </Link>
      </div>
    </div>
  );
}
